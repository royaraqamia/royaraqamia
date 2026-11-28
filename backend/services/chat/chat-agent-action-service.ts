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
import type { ChatAttachmentStorage } from '@/backend/repositories/chat/chat-attachment-storage';
import { storeGeneratedMedia } from './chat-app-media';
import { CHAT_MEDIA_UNAVAILABLE, MEDIA_APP_REGISTRY_NAMES } from '@/shared/contracts/chat-media';
import { logger } from '@/backend/shared/logger';
import { ChatAgentError } from '@/backend/services/chat/chat-agent-service';
import { McpRemoteError } from '@/backend/shared/domain/mcp-remote';
import {
  executeFirstPartyTool,
  remoteRefusal,
  refusalSentence,
} from '@/backend/services/chat/chat-agent-tool-execution';
import {
  appToolParts,
  chatAgentActionSentence,
  type ChatAgentAction,
} from '@/shared/contracts/chat-agent-actions';
import { CHAT_APP_CALLS_SPENT, type ChatMessage } from '@/shared/contracts/chat';
import type { Reservation } from '@/backend/services/plans/plan-gate';
import { UsageLimitReachedError } from '@/backend/services/plans/usage-service';

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
  apps?: Pick<McpAppToolsService, 'call'> &
    Partial<Pick<McpAppToolsService, 'fetchMedia' | 'catalog'>>;
  /** The bucket the bytes of a confirmed generation are stored in (ADR-0216). */
  attachments?: Pick<ChatAttachmentStorage, 'upload'>;
  /**
   * One remote call to an app we do not own (#1226). A card is the member's own
   * request, so it spends the same counter a turn's call does — and a declined
   * card never reaches this.
   */
  reserveAppCall(userId: string): Promise<Reservation>;
}

export interface ChatAgentActionResolutionContext {
  /** The caller's own session: the service runs under their policies. */
  supabase: SupabaseClient<Database>;
  ip: string;
}

const ALREADY_RESOLVED = 'تمّت معالجة هذا الإجراء مسبقاً.';
const NOT_FOUND = 'الإجراء غير موجود.';
const NOT_ASSISTANT_THREAD = 'هذه المحادثة لا تقبل هذا الإجراء.';

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
    options: { appName?: string; tier?: number } = {}
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
      ...(options.tier !== undefined ? { tier: options.tier } : {}),
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

      // Counted before it leaves, exactly like a turn's call (#1226).
      let appCall: Reservation;
      try {
        appCall = await this.deps.reserveAppCall(userId);
      } catch (error) {
        if (error instanceof UsageLimitReachedError) {
          return this.settle(conversationId, claimed, 'failed', { error: CHAT_APP_CALLS_SPENT });
        }
        throw error;
      }

      // Only a curated member-paid app gets its answer interpreted as a file.
      // A stranger's tool that happens to fail must never borrow this lane.
      const catalog = await this.deps.apps.catalog?.(userId).catch(() => []);
      const isMediaApp = (catalog ?? []).some(
        (tool) =>
          tool.connectionId === remote.connectionId &&
          Boolean(tool.registryName) &&
          MEDIA_APP_REGISTRY_NAMES.includes(tool.registryName as string)
      );

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
          return this.settle(conversationId, claimed, 'failed', {
            error: isMediaApp ? CHAT_MEDIA_UNAVAILABLE : refusal,
          });
        }

        /*
          A generation is only a write here because the member carded it. The
          file itself still has to be fetched with their token and stored in our
          bucket before it can appear in the thread (ADR-0216).
        */
        if (isMediaApp) {
          const fetchMedia = this.deps.apps.fetchMedia;
          const attachments = this.deps.attachments;
          if (!fetchMedia || !attachments) {
            return this.settle(conversationId, claimed, 'failed', {
              error: CHAT_MEDIA_UNAVAILABLE,
            });
          }
          const outcome = await storeGeneratedMedia({
            apps: { fetchMedia },
            attachments,
            userId,
            connectionId: remote.connectionId,
            conversationId,
            result,
          });
          if (outcome.status === 'failed') {
            return this.settle(conversationId, claimed, 'failed', {
              error: CHAT_MEDIA_UNAVAILABLE,
            });
          }
          if (outcome.status === 'ok') {
            await this.deps.agent
              .setMessageMedia(claimed.messageId, outcome.media)
              .catch((error: unknown) => {
                logger.warn('Assistant app media could not be attached', {
                  conversationId,
                  error: String(error),
                });
              });
          }
        }

        return this.settle(conversationId, claimed, 'applied', { result: result ?? null });
      } catch (error) {
        // A refusal answered before the request left spends nothing; anything
        // else may have reached the server, and a call that left is a call.
        if (
          error instanceof McpRemoteError &&
          (error.failure === 'protocol' || error.failure === 'reauth')
        ) {
          await appCall.release();
        }
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

    // The same executor a granted call in a turn crosses (ADR-0180 decision 3):
    // one parse, one run as the member, one refusal vocabulary.
    const outcome = await executeFirstPartyTool(tool, claimed.args, {
      userId,
      supabase: context.supabase,
      ip: context.ip,
    } satisfies ChatAgentToolContext);

    if (outcome.status === 'failed') {
      logger.warn('Assistant action failed', {
        tool: claimed.tool,
        conversationId,
        error: String(outcome.error),
      });
      return this.settle(conversationId, claimed, 'failed', { error: outcome.error });
    }

    return this.settle(conversationId, claimed, 'applied', {
      result: (outcome.result ?? null) as Record<string, unknown> | null,
    });
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

  /**
   * The audit row for a tier-1 tool a grant let run inside the turn (ADR-0180
   * decision 3, #1438). It is written against the answer's message, so the
   * thread shows what ran and the row keeps `grant_id` as its reason.
   */
  async recordRun(input: {
    userId: string;
    conversationId: string;
    messageId: string;
    tool: string;
    args: Record<string, unknown>;
    tier: number;
    grantId: string;
    status: 'applied' | 'failed';
    result: Record<string, unknown>;
  }): Promise<void> {
    await this.deps.actions.insertAudit(input);
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
