import type { ChatAgentRepository } from '@/backend/repositories/chat/chat-agent-repository';
import type { ChatService } from '@/backend/services/chat/chat-service';
import type { Reservation } from '@/backend/services/plans/plan-gate';
import {
  AiChatProviderError,
  type AiChatClient,
  type AiChatMessage,
} from '@/backend/clients/ai-chat';
import { UsageLimitReachedError } from '@/backend/services/plans/usage-service';
import { logger } from '@/backend/shared/logger';
import {
  CHAT_AGENT_HISTORY_MAX,
  CHAT_AGENT_TOKEN_BUDGET,
  normalizeChatBody,
  type ChatAgentAllowance,
  type ChatAgentEvent,
  type ChatMessage,
} from '@/shared/contracts/chat';

/**
 * The assistant's turn (ADR-0113, #817).
 *
 * It composes four things the surface already has — the thread, the member's
 * own message, the counted allowance and one provider call — and decides the
 * two states the composer draws: a Free member's locked assistant, and an
 * allowance that is spent for today. Neither is an error: the thread stays
 * readable and the composer says which sentence applies.
 *
 * No tool calls, no account data, no write the model proposes: the request is
 * text in and text out, and the only row written on the member's behalf is the
 * assistant's own reply.
 */

export class ChatAgentError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
    this.name = 'ChatAgentError';
  }
}

/** The system prompt, kept apart from the history the member wrote. */
const SYSTEM_PROMPT = [
  'أنت «المساعد الذكي» في تطبيق رؤى رقمية، تجيب بالعربية الفصحى المبسطة وبإيجاز.',
  'أجب بنص فقط. لا تستخدم أدوات، ولا تدّعِ أنك قرأت حساب المستخدم أو نفّذت أي إجراء.',
  'إن سُئلت عن شيء خارج معرفتك، قل ذلك بوضوح بدل التخمين.',
  'الأرقام تُكتب دائماً بالأرقام اللاتينية (0-9).',
].join('\n');

/** The sentence a spent allowance answers with, naming when it comes back. */
export function allowanceSpentSentence(resetsAt: string): string {
  const reset = new Date(resetsAt);
  const time = Number.isNaN(reset.getTime())
    ? 'منتصف الليل'
    : new Intl.DateTimeFormat('ar-u-nu-latn', {
        hour: 'numeric',
        minute: '2-digit',
        timeZone: 'Asia/Damascus',
      }).format(reset);
  return `وصلت إلى حد اليوم. يعود الحد بعد ${time}.`;
}

const PLAN_LOCKED = 'المساعد متاح لمشتركي الخطة المدفوعة.';
const UNAVAILABLE = 'المساعد غير متاح حالياً.';
const COULD_NOT_ANSWER = 'تعذّر الحصول على ردّ من المساعد. حاول مرّة أخرى.';

/** A ledger row the project's ceiling refused (`private.enforce_chat_agent_project_cap`). */
function isProjectAllowanceRefusal(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const code = (error as { code?: unknown }).code;
  const message = (error as { message?: unknown }).message;
  return (
    String(code) === '53400' &&
    typeof message === 'string' &&
    message.includes('chat agent project daily allowance')
  );
}

/** Roughly four characters a token, which is the estimate the budget is stated in. */
function approximateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * The last twenty lines, trimmed to the token budget, in the order a model
 * reads them. Tombstones and empty bodies are dropped: a deleted line is not
 * context. The trim happens from the oldest end, so the newest exchange — the
 * question just asked — always survives.
 */
export function trimHistory(
  messages: ChatMessage[],
  max = CHAT_AGENT_HISTORY_MAX,
  budget = CHAT_AGENT_TOKEN_BUDGET
): AiChatMessage[] {
  const usable = messages
    .filter((message) => message.deletedAt === null && Boolean(message.body?.trim()))
    .slice(-max)
    .map<AiChatMessage>((message) => ({
      role: message.senderKind === 'agent' ? 'assistant' : 'user',
      content: message.body?.trim() ?? '',
    }));

  let tokens = usable.reduce((total, message) => total + approximateTokens(message.content), 0);
  let start = 0;
  while (start < usable.length - 1 && tokens > budget) {
    tokens -= approximateTokens(usable[start]?.content ?? '');
    start += 1;
  }

  return usable.slice(start);
}

export interface ChatAgentServiceDeps {
  agent: ChatAgentRepository;
  chats: ChatService;
  /** One counted action, held open until the answer is stored. */
  reserve(userId: string): Promise<Reservation>;
  /** The configured provider, or null when no key is set. */
  client: AiChatClient | null;
}

export class ChatAgentService {
  constructor(private readonly deps: ChatAgentServiceDeps) {}

  /** What the thread draws before a composer: availability and both meters. */
  async state(userId: string): Promise<{ available: boolean; allowance: ChatAgentAllowance }> {
    return {
      available: this.deps.client !== null,
      allowance: await this.deps.agent.allowance(userId),
    };
  }

  /**
   * One turn, streamed. The member's message is written first (so the thread
   * shows it immediately and the answer lands beneath it), the count is taken
   * before the provider is called, and the count is given back when anything
   * after it fails — a turn that produced no answer must not spend the day's
   * allowance.
   */
  async *turn(
    userId: string,
    conversationId: string,
    body: string
  ): AsyncGenerator<ChatAgentEvent, void, void> {
    const question = normalizeChatBody(body);
    if (!question) throw new ChatAgentError(400, 'اكتب سؤالك');

    const client = this.deps.client;
    if (!client) throw new ChatAgentError(503, UNAVAILABLE);

    const thread = await this.deps.chats.getThread(userId, conversationId);
    if (!thread) throw new ChatAgentError(404, 'المحادثة غير موجودة');
    if (thread.kind !== 'agent') throw new ChatAgentError(400, 'هذه المحادثة ليست مع المساعد');

    const allowance = await this.deps.agent.allowance(userId);
    if (allowance.member.cap === 0) throw new ChatAgentError(402, PLAN_LOCKED);
    if (
      allowance.member.used >= allowance.member.cap ||
      allowance.project.used >= allowance.project.limit
    ) {
      throw new ChatAgentError(402, allowanceSpentSentence(allowance.resetsAt));
    }

    let reservation: Reservation;
    try {
      reservation = await this.deps.reserve(userId);
    } catch (error) {
      if (error instanceof UsageLimitReachedError) {
        const spent = await this.deps.agent.allowance(userId);
        throw new ChatAgentError(402, allowanceSpentSentence(spent.resetsAt));
      }
      if (isProjectAllowanceRefusal(error)) {
        throw new ChatAgentError(402, allowanceSpentSentence(allowance.resetsAt));
      }
      throw error;
    }

    try {
      await this.deps.chats.sendMessage(userId, conversationId, { body: question });

      const page = await this.deps.chats.listMessages(userId, conversationId, null);
      const messages: AiChatMessage[] = [
        { role: 'system', content: SYSTEM_PROMPT },
        ...trimHistory(page.messages),
      ];

      const timeout = AbortSignal.timeout(55_000);
      let answer = '';

      try {
        for await (const delta of client.streamReply(messages, timeout)) {
          answer += delta;
          yield { type: 'delta', text: delta };
        }
      } catch (error) {
        logger.warn('Assistant turn failed', { error: String(error) });
        throw new ChatAgentError(
          502,
          error instanceof AiChatProviderError && (error.status === 402 || error.status === 429)
            ? 'المساعد مشغول الآن، حاول بعد قليل.'
            : COULD_NOT_ANSWER
        );
      }

      const text = answer.trim();
      if (!text) throw new ChatAgentError(502, COULD_NOT_ANSWER);

      const record = await this.deps.agent.insertAgentMessage(conversationId, text);
      yield {
        type: 'done',
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
      };
    } catch (error) {
      await reservation.release();
      throw error;
    }
  }
}
