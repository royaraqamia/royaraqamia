import type { SupabaseClient } from '@supabase/supabase-js';

import type { ChatAgentRepository } from '@/backend/repositories/chat/chat-agent-repository';
import type { ChatAgentActionService } from '@/backend/services/chat/chat-agent-action-service';
import {
  chatAgentTool,
  chatAgentToolDefinitions,
  type ChatAgentTool,
} from '@/backend/services/chat/chat-agent-tools';
import type { ChatService } from '@/backend/services/chat/chat-service';
import type { Database } from '@/backend/models/database.types';
import type { Reservation } from '@/backend/services/plans/plan-gate';
import {
  AiChatProviderError,
  type AiChatClient,
  type AiChatMessage,
  type AiChatToolCall,
  type AiChatWireMessage,
} from '@/backend/clients/ai-chat';
import { UsageLimitReachedError } from '@/backend/services/plans/usage-service';
import { logger } from '@/backend/shared/logger';
import {
  CHAT_AGENT_HISTORY_MAX,
  CHAT_AGENT_MAX_ROUNDS,
  CHAT_AGENT_TOKEN_BUDGET,
  CHAT_AGENT_TURN_TIMEOUT_MS,
  normalizeChatBody,
  type ChatAgentAllowance,
  type ChatAgentEvent,
  type ChatMessage,
} from '@/shared/contracts/chat';
import { CHAT_AGENT_TOOLS } from '@/shared/contracts/chat-agent-actions';

/**
 * The assistant's turn (ADR-0113, #817, #818).
 *
 * It composes the thread, the member's own message, the counted allowance and
 * the provider's stream, and decides the two states the composer draws: a Free
 * member's locked assistant, and an allowance that is spent for today. Neither
 * is an error: the thread stays readable and the composer says which sentence
 * applies.
 *
 * A turn may call the assistant's **read** tools, whose answers reach the model
 * inside the same turn. It never calls a **write** tool: a write is proposed —
 * a line in the thread and a `chat_agent_actions` row — and runs only when the
 * member confirms it, on their own session (ADR-0113, #818). The number of tool
 * rounds is bounded, so a model that keeps asking answers with what it has.
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
  'لديك أدوات تقرأ بيانات العضو نفسه؛ استخدمها عندما يسأل عن بياناته بدل التخمين.',
  'كل أداة كتابة لا تنفّذ شيئاً الآن: تُعرض على العضو كاقتراح، ولا تُنفَّذ إلا بعد أن يؤكّدها بنفسه. قل ذلك بوضوح ولا تدّعِ أنك نفّذت شيئاً.',
  'لا تطلب من العضو معرّف حسابه ولا تكتب معرّف عضو في أي أداة؛ الخادم يعرف من أنت.',
  'إن سُئلت عن شيء خارج معرفتك، قل ذلك بوضوح بدل التخمين.',
  'الأرقام تُكتب دائماً بالأرقام اللاتينية (0-9).',
].join('\n');

/** What a turn answers when the model asked for tools until the rounds ran out. */
const ROUNDS_EXHAUSTED = 'لم أستطع إكمال ما طلبته الآن. أعد صياغة الطلب أو أكمل ما تريده بنفسك.';

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
  /** The proposals a write tool leaves, and the member's own resolution. */
  actions: Pick<ChatAgentActionService, 'propose'>;
  /** The registry, overridable so a test can pin the loop without a service. */
  resolveTool?: (name: string) => ChatAgentTool | null;
}

/** What a turn's tools need from the request: the caller's session and address. */
export interface ChatAgentTurnContext {
  supabase: SupabaseClient<Database>;
  ip: string;
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

  /** The tool registry, unless a test pinned its own. */
  private toolOf(name: string): ChatAgentTool | null {
    return (this.deps.resolveTool ?? chatAgentTool)(name);
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
    body: string,
    context: ChatAgentTurnContext
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

    // The record exists before the provider is called, so a turn that dies has
    // somewhere to say so — and the retry below has a row to count itself on.
    // Best-effort on purpose: the deploy that introduces this lands before the
    // migration that creates the table, and a diagnostics row must never be able
    // to refuse the member an answer (or leak their allowance).
    const turnId = await this.deps.agent
      .startTurn(conversationId, userId)
      .catch((error: unknown) => {
        logger.warn('Assistant turn record could not be opened', { error: String(error) });
        return null;
      });
    let answer = '';

    try {
      await this.deps.chats.sendMessage(userId, conversationId, { body: question });

      const page = await this.deps.chats.listMessages(userId, conversationId, null);
      const messages: AiChatWireMessage[] = [
        { role: 'system', content: SYSTEM_PROMPT },
        ...trimHistory(page.messages),
      ];

      const tools = chatAgentToolDefinitions();
      const deadline = Date.now() + CHAT_AGENT_TURN_TIMEOUT_MS;
      let rounds = 0;
      let retried = false;

      try {
        for (;;) {
          const calls: AiChatToolCall[] = [];
          let roundText = '';
          let streamed = false;

          try {
            const signal = AbortSignal.timeout(Math.max(1_000, deadline - Date.now()));
            for await (const event of client.streamWithTools(messages, tools, signal)) {
              if (event.type === 'text') {
                roundText += event.text;
                streamed = true;
                answer += event.text;
                yield { type: 'delta', text: event.text };
              } else {
                calls.push(event.call);
              }
            }
          } catch (error) {
            // One clean retry, and only when repeating the call cannot duplicate
            // anything: no text shown, no tool run, nothing proposed yet. A busy
            // provider is the case this exists for.
            if (
              !retried &&
              !streamed &&
              answer === '' &&
              calls.length === 0 &&
              rounds === 0 &&
              retryable(error)
            ) {
              retried = true;
              if (turnId) await this.deps.agent.recordAttempt(turnId, 1);
              await sleep(RETRY_DELAY_MS);
              continue;
            }
            throw error;
          }

          // Text with no calls is the answer, and it is the one that is kept.
          if (calls.length === 0) break;
          rounds += 1;
          if (rounds > CHAT_AGENT_MAX_ROUNDS) break;

          messages.push({
            role: 'assistant',
            content: roundText || null,
            tool_calls: calls.map((call) => ({
              id: call.id,
              type: 'function' as const,
              function: { name: call.name, arguments: call.arguments },
            })),
          });

          for (const call of calls) {
            const tool = this.toolOf(call.name);
            if (!tool) {
              messages.push(toolAnswer(call.id, { error: 'أداة غير معروفة' }));
              continue;
            }

            const args = parseToolArgs(call.arguments);

            // A write is proposed, never run here: the member confirms it.
            if (tool.kind === 'write') {
              const proposal = await this.deps.actions.propose(
                conversationId,
                tool.name,
                args ?? {}
              );
              yield { type: 'proposal', message: proposal.message, action: proposal.action };
              messages.push(
                toolAnswer(call.id, {
                  status: 'proposed',
                  note: 'الاقتراح معروض على العضو، ولم يُنفَّذ بعد.',
                })
              );
              continue;
            }

            const parsed = tool.schema.safeParse(args);
            if (!parsed.success) {
              messages.push(
                toolAnswer(call.id, {
                  error: parsed.error.issues[0]?.message ?? 'بيانات الأداة غير صالحة',
                })
              );
              continue;
            }

            try {
              const result = await tool.run(parsed.data, {
                userId,
                supabase: context.supabase,
                ip: context.ip,
              });
              yield {
                type: 'tool',
                name: tool.name,
                label: CHAT_AGENT_TOOLS[tool.name].label,
              };
              messages.push(toolAnswer(call.id, result));
            } catch (error) {
              logger.warn('Assistant read tool failed', { tool: tool.name, error: String(error) });
              messages.push(
                toolAnswer(call.id, {
                  error: error instanceof Error ? error.message : 'تعذّر تنفيذ الأداة',
                })
              );
            }
          }
        }
      } catch (error) {
        logger.warn('Assistant turn failed', { error: String(error), turn: turnId });
        throw new ChatAgentError(
          502,
          error instanceof AiChatProviderError && (error.status === 402 || error.status === 429)
            ? 'المساعد مشغول الآن، حاول بعد قليل.'
            : COULD_NOT_ANSWER
        );
      }

      const text = answer.trim() || ROUNDS_EXHAUSTED;

      const record = await this.deps.agent.insertAgentMessage(conversationId, text);
      if (turnId) await this.deps.agent.settleTurn(turnId);
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
      // The row keeps what the member already read, so a half-written answer is
      // visible to whoever looks rather than discarded with the request.
      if (turnId) {
        await this.deps.agent
          .failTurn(turnId, {
            error: error instanceof Error ? error.message : String(error),
            partialText: answer,
          })
          .catch(() => undefined);
      }
      await reservation.release();
      throw error;
    }
  }
}

/** How long a clean retry waits before asking the provider again. */
const RETRY_DELAY_MS = 600;

/**
 * Whether a retry can plausibly succeed. A billing wall (402) or a refusal the
 * provider phrased itself will answer the same way twice; a rate limit (429), a
 * 5xx or a socket that died is worth one more ask.
 */
function retryable(error: unknown): boolean {
  if (error instanceof AiChatProviderError) {
    return error.status === 429 || error.status >= 500;
  }
  // Not the provider's own status: a timeout, a reset, DNS. Worth one retry.
  return true;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** A tool's answer as the provider reads it: JSON, bounded so it fits the window. */
function toolAnswer(callId: string, value: unknown): AiChatWireMessage {
  let content: string;
  try {
    content = JSON.stringify(value ?? null);
  } catch {
    content = '{"error":"تعذّر تمثيل نتيجة الأداة"}';
  }
  return { role: 'tool', tool_call_id: callId, content: content.slice(0, 4_000) };
}

/** The model's arguments, as an object. Anything else is refused downstream. */
function parseToolArgs(raw: string): Record<string, unknown> | null {
  if (!raw.trim()) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}
