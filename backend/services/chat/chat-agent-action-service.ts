import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/backend/models/database.types';
import type { ChatAgentActionRepository } from '@/backend/repositories/chat/chat-agent-action-repository';
import type { ChatAgentRepository } from '@/backend/repositories/chat/chat-agent-repository';
import type { ChatService } from '@/backend/services/chat/chat-service';
import {
  chatAgentTool,
  type ChatAgentTool,
  type ChatAgentToolContext,
} from '@/backend/services/chat/chat-agent-tools';
import type { McpAppToolsService } from '@/backend/services/mcp/marketplace/app-tools-service';
import { logger } from '@/backend/shared/logger';
import { AppError } from '@/backend/shared/errors';
import { RepositoryError } from '@/backend/shared/repository-error';
import { ChatAgentError } from '@/backend/services/chat/chat-agent-service';
import {
  appToolParts,
  chatAgentActionSentence,
  type ChatAgentAction,
} from '@/shared/contracts/chat-agent-actions';
import type { ChatMessage } from '@/shared/contracts/chat';

/**
 * A proposal, and the one member who may resolve it (ADR-0113, #818).
 *
 * The model never performs a write: it asks for one, the turn writes the
 * proposal (a line in the thread plus the row), and this service is where the
 * member's own confirmation turns it into a call on the product's service.
 *
 * The row is the record, so every outcome lands on it: `applied` with what the
 * service answered, `failed` with the reason it refused (a plan cap, a policy,
 * arguments that no longer match the tool). A refusal is drawn as a sentence,
 * not as a broken screen, which is why it answers 200 with the row: the card
 * is the surface.
 */

export interface ChatAgentActionServiceDeps {
  actions: ChatAgentActionRepository;
  agent: ChatAgentRepository;
  chats: ChatService;
  /** The registry, overridable so a test can pin one tool. */
  resolveTool?: (name: string) => ChatAgentTool | null;
  /**
   * The apps the member connected: a proposal that names one runs on the remote
   * server when the member confirms it, not on a service of ours (#1225).
   */
  apps?: Pick<McpAppToolsService, 'call'>;
}

export interface ChatAgentActionResolutionContext {
  /** The caller's own session: the service runs under their policies. */
  supabase: SupabaseClient<Database>;
  ip: string;
}

const ALREADY_RESOLVED = 'تمّت معالجة هذا الإجراء مسبقاً.';
const NOT_FOUND = 'الإجراء غير موجود.';
const NOT_ASSISTANT_THREAD = 'هذه المحادثة ليست مع نور.';

export class ChatAgentActionService {
  constructor(private readonly deps: ChatAgentActionServiceDeps) {}

  /** The proposals drawn under one page of the thread. */
  async list(conversationId: string, messageIds: string[]): Promise<ChatAgentAction[]> {
    const rows = await this.deps.actions.listForMessages(messageIds);
    return rows.filter((row) => row.conversationId === conversationId);
  }

  /**
   * The model's suggestion, written as two rows: the assistant's line, and the
   * proposal that names the tool and its arguments. Nothing is executed here.
   */
  async propose(
    conversationId: string,
    tool: string,
    args: Record<string, unknown>,
    options: { appName?: string } = {}
  ): Promise<{ message: ChatMessage; action: ChatAgentAction }> {
    const record = await this.deps.agent.insertAgentMessage(
      conversationId,
      chatAgentActionSentence(tool, args, options.appName)
    );
    const inserted = await this.deps.actions.insertProposal({
      conversationId,
      messageId: record.id,
      tool,
      args,
    });
    // The card is drawn from this answer before the thread is read again, so the
    // app's name rides on it now rather than only on the next page's rows.
    const action = options.appName ? { ...inserted, appName: options.appName } : inserted;

    return {
      message: {
        id: record.id,
        conversationId: record.conversationId,
        senderId: null,
        senderKind: 'agent',
        body: record.body,
        replyToId: record.replyToId,
        editedAt: record.editedAt,
        deletedAt: record.deletedAt,
        createdAt: record.createdAt,
        attachments: [],
        replyTo: null,
      },
      action,
    };
  }

  /**
   * The member's confirmation. The claim is a single conditional write, so a
   * double tap or a replayed request finds the row already resolved and applies
   * nothing; the tool then runs as the member, and its answer is what the row
   * keeps.
   */
  async confirm(
    userId: string,
    conversationId: string,
    actionId: string,
    context: ChatAgentActionResolutionContext
  ): Promise<ChatAgentAction> {
    await this.assertAssistantThread(userId, conversationId);

    const existing = await this.deps.actions.find(conversationId, actionId);
    if (!existing) throw new ChatAgentError(404, NOT_FOUND);
    if (existing.status !== 'proposed') throw new ChatAgentError(409, ALREADY_RESOLVED);

    const claimed = await this.deps.actions.claim(conversationId, actionId, userId);
    if (!claimed) throw new ChatAgentError(409, ALREADY_RESOLVED);

    // A tool of an app we do not own: the confirmation is the call itself, on
    // the member's own connection and with the member's own grant.
    const remote = appToolParts(claimed.tool);
    if (remote) {
      if (!this.deps.apps) {
        return this.settle(conversationId, claimed, 'failed', { error: 'أداة غير معروفة' });
      }

      try {
        const result = await this.deps.apps.call({
          userId,
          connectionId: remote.connectionId,
          toolName: remote.toolName,
          args: claimed.args,
          // The member's own tap is the asking, whatever the connection's level.
          intent: 'confirmed',
        });

        const refusal = remoteRefusal(result);
        if (refusal) {
          return this.settle(conversationId, claimed, 'failed', { error: refusal });
        }
        return this.settle(conversationId, claimed, 'applied', { result: result ?? null });
      } catch (error) {
        const reason = refusalSentence(error);
        logger.warn('Assistant app action failed', {
          tool: claimed.tool,
          conversationId,
          error: String(reason),
        });
        return this.settle(conversationId, claimed, 'failed', { error: reason });
      }
    }

    const tool = (this.deps.resolveTool ?? chatAgentTool)(claimed.tool);
    if (!tool) {
      return this.settle(conversationId, claimed, 'failed', { error: 'أداة غير معروفة' });
    }

    const parsed = tool.schema.safeParse(claimed.args);
    if (!parsed.success) {
      const reason = parsed.error.issues[0]?.message ?? 'بيانات الإجراء غير صالحة';
      return this.settle(conversationId, claimed, 'failed', { error: reason });
    }

    try {
      const result = await tool.run(parsed.data, {
        userId,
        supabase: context.supabase,
        ip: context.ip,
      } satisfies ChatAgentToolContext);

      // A service that answers `{ error }` refused the write in words meant for
      // the member (a category that does not exist, a post already published).
      if (isRefusal(result)) {
        return this.settle(conversationId, claimed, 'failed', { error: result.error });
      }

      return this.settle(conversationId, claimed, 'applied', {
        result: result ?? null,
      });
    } catch (error) {
      const reason = refusalSentence(error);
      logger.warn('Assistant action failed', {
        tool: claimed.tool,
        conversationId,
        error: String(reason),
      });
      return this.settle(conversationId, claimed, 'failed', { error: reason });
    }
  }

  /** Declining is a resolution too, and nothing else happens. */
  async reject(userId: string, conversationId: string, actionId: string): Promise<ChatAgentAction> {
    await this.assertAssistantThread(userId, conversationId);

    const existing = await this.deps.actions.find(conversationId, actionId);
    if (!existing) throw new ChatAgentError(404, NOT_FOUND);
    if (existing.status !== 'proposed') throw new ChatAgentError(409, ALREADY_RESOLVED);

    const rejected = await this.deps.actions.reject(conversationId, actionId, userId);
    if (!rejected) throw new ChatAgentError(409, ALREADY_RESOLVED);
    return rejected;
  }

  private async settle(
    conversationId: string,
    claimed: ChatAgentAction,
    status: 'applied' | 'failed',
    result: Record<string, unknown>
  ): Promise<ChatAgentAction> {
    const settled = await this.deps.actions.settle(conversationId, claimed.id, status, result);
    return settled;
  }

  /** A proposal only exists in the assistant's own thread. */
  private async assertAssistantThread(userId: string, conversationId: string): Promise<void> {
    const thread = await this.deps.chats.getThread(userId, conversationId);
    if (!thread) throw new ChatAgentError(404, 'المحادثة غير موجودة');
    if (thread.kind !== 'agent') throw new ChatAgentError(400, NOT_ASSISTANT_THREAD);
  }
}

/**
 * A remote call the server itself marked as failed, in the words it wrote.
 *
 * `isError` is the MCP server's own verdict about the call: it ran and refused,
 * which is a different outcome from a call that never reached it, and the card
 * has to say so rather than claim the write was applied. The text is the
 * server's, so it is bounded like any other untrusted content.
 */
function remoteRefusal(result: unknown): string | null {
  if (typeof result !== 'object' || result === null) return null;
  if ((result as { isError?: unknown }).isError !== true) return null;

  const content = (result as { content?: unknown }).content;
  const words = Array.isArray(content)
    ? content
        .map((block) =>
          typeof block === 'object' &&
          block !== null &&
          typeof (block as { text?: unknown }).text === 'string'
            ? (block as { text: string }).text.trim()
            : ''
        )
        .filter(Boolean)
        .join(' ')
    : '';

  return words ? words.slice(0, 300) : 'رفض التطبيق تنفيذ الإجراء.';
}

function isRefusal(value: unknown): value is { error: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'error' in value &&
    typeof (value as { error: unknown }).error === 'string'
  );
}

/**
 * What the card writes when the write itself refused. A policy's own sentence
 * (`AppError`, `ChatError`) is the reason; a database refusal is translated,
 * because "the plan cap for community_drafts is reached" is not the member's
 * language; anything else is a fault, and its internals are not theirs to read.
 */
function refusalSentence(error: unknown): string {
  const fromDatabase = databaseReason(error);
  if (fromDatabase) return fromDatabase;

  if (error instanceof ChatAgentError) return error.message;
  if (error instanceof AppError) return error.message;
  if (error instanceof Error && error.message.trim()) return error.message;
  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as { message: unknown }).message === 'string' &&
    (error as { message: string }).message.trim()
  ) {
    return (error as { message: string }).message;
  }
  return 'تعذّر تنفيذ الإجراء.';
}

/**
 * The database's own refusals, in the member's words. `PL001` is the plan cap
 * that `private.enforce_owned_item_cap` raises; the rest are the guards a route
 * would otherwise have checked first (a post that is not there, a missing
 * column, a policy).
 */
function databaseReason(error: unknown): string | null {
  const cause = error instanceof RepositoryError ? error.cause : error;
  if (typeof cause !== 'object' || cause === null) return null;

  const code = String((cause as { code?: unknown }).code ?? '');
  switch (code) {
    case 'PL001':
      return 'بلغت حدّ خطتك لهذا العنصر، ولا يمكن إضافة المزيد.';
    case '42501':
      return 'لا يمكن تنفيذ هذا الإجراء بحسابك.';
    case 'P0002':
      return 'لم أجد هذا العنصر.';
    case '22023':
      return 'البيانات المرسلة غير مكتملة.';
    default:
      return null;
  }
}
