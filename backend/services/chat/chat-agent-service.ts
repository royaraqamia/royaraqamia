import type { SupabaseClient } from '@supabase/supabase-js';

import type {
  ChatAgentRepository,
  AgentTurnRow,
} from '@/backend/repositories/chat/chat-agent-repository';
import type { ChatAgentActionService } from '@/backend/services/chat/chat-agent-action-service';
import {
  chatAgentTool,
  chatAgentToolDefinitions,
  type ChatAgentTool,
} from '@/backend/services/chat/chat-agent-tools';
import type { ChatService } from '@/backend/services/chat/chat-service';
import type { ChatAttachmentStorage } from '@/backend/repositories/chat/chat-attachment-storage';
import type { Database } from '@/backend/models/database.types';
import type { Reservation } from '@/backend/services/plans/plan-gate';
import {
  type AiChatClient,
  type AiChatContentPart,
  type AiChatMessage,
  type AiChatToolCall,
  type AiChatWireMessage,
} from '@/backend/clients/ai-chat';
import { AiChatProviderError } from '@/backend/shared/domain/ai-chat';
import { UsageLimitReachedError } from '@/backend/services/plans/usage-service';
import { logger } from '@/backend/shared/logger';
import {
  CHAT_AGENT_HISTORY_MAX,
  CHAT_AGENT_MAX_ROUNDS,
  CHAT_AGENT_TOKEN_BUDGET,
  CHAT_AGENT_TURN_TIMEOUT_MS,
  chatAttachmentIsAudio,
  chatAttachmentIsInlineImage,
  chatAttachmentIsReadableText,
  normalizeChatBody,
  type ChatAgentAllowance,
  type ChatAgentEvent,
  type ChatAttachmentInput,
  type ChatMessage,
} from '@/shared/contracts/chat';
import { CHAT_AGENT_TOOLS } from '@/shared/contracts/chat-agent-actions';
import { behaviourLines } from '@/shared/contracts/agent-behaviour.mjs';

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

/**
 * A turn that failed after it may already have written something. The text rides
 * on the error so the row can keep it, and so the controller still reads it as
 * the one sentence the stream carries.
 */
export class ChatAgentTurnFailure extends ChatAgentError {
  constructor(
    status: number,
    message: string,
    readonly partialText: string
  ) {
    super(status, message);
    this.name = 'ChatAgentTurnFailure';
  }
}

/** The system prompt, kept apart from the history the member wrote. */
export const SYSTEM_PROMPT = [
  'أنت «المساعد الذكي» في تطبيق رؤى رقمية، تجيب بالعربية الفصحى المبسطة وبإيجاز.',
  'لديك أدوات تقرأ بيانات العضو نفسه؛ استخدمها عندما يسأل عن بياناته بدل التخمين.',
  'كل أداة كتابة لا تنفّذ شيئاً الآن: تُعرض على العضو كاقتراح، ولا تُنفَّذ إلا بعد أن يؤكّدها بنفسه. قل ذلك بوضوح ولا تدّعِ أنك نفّذت شيئاً.',
  'لا تطلب من العضو معرّف حسابه ولا تكتب معرّف عضو في أي أداة؛ الخادم يعرف من أنت.',
  'إن سُئلت عن شيء خارج معرفتك، قل ذلك بوضوح بدل التخمين.',
  'الأرقام تُكتب دائماً بالأرقام اللاتينية (0-9).',
  // The length and assumption rules are the same three doors share (ADR-0136).
  // The assistant is the member-facing one, so it may explain in one sentence
  // more than the terminal does.
  ...behaviourLines({ surface: 'assistant' }),
].join('\n');

/** What a turn answers when the model asked for tools until the rounds ran out. */
const ROUNDS_EXHAUSTED = 'لم أستطع إكمال ما طلبته الآن. أعد صياغة الطلب أو أكمل ما تريده بنفسك.';

/**
 * A transcript is a machine's reading of speech, and the model has to treat it as
 * one — otherwise it answers "you sent me text, not audio", which is true and
 * useless.
 */
const SPOKEN_NOTE = [
  'الرسالة وصلت كتسجيل صوتي وفُرّغت إلى نص آلياً، وقد يحتمل التفريغ أخطاءً.',
  'لا تعلّق على أنها نص، وتعامل معها ككلام العضو.',
].join(' ');

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
/** A recording no model would transcribe. */
const COULD_NOT_TRANSCRIBE = 'لم أستطع تحويل الصوت إلى نص. أعد إرساله أو اكتبه.';
/** A file whose bytes could not be read back from the bucket. */
const COULD_NOT_READ = 'لم أستطع قراءة المرفق. أعد إرساله أو اكتب سؤالك.';
/** A format no model on this deployment can read: PDF, archives, documents. */
const UNREADABLE_FILE =
  'لا أستطيع قراءة هذا النوع من الملفات. أرسل صورة أو ملفاً نصياً أو رسالة صوتية.';
/** The label a transcript carries inside the turn, so the model sees its origin. */
const SPOKEN_LABEL = 'تسجيل صوتي';
/** A text file's ceiling in the turn: enough for a long note, not a whole book. */
const ATTACHMENT_TEXT_MAX = 20_000;
/** An image's ceiling in a turn, because base64 rides inside the request body. */
const ATTACHMENT_IMAGE_MAX = 5 * 1024 * 1024;
/** A picture the provider would refuse after the turn already spent its count. */
const IMAGE_TOO_LARGE = 'الصورة كبيرة جداً على المساعد. أرسل صورة أصغر أو اكتب سؤالك.';

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
  /** The bucket, to read a voice note's bytes back for transcription. */
  attachments: Pick<ChatAttachmentStorage, 'download'>;
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
    context: ChatAgentTurnContext,
    attachments: ChatAttachmentInput[] = []
  ): AsyncGenerator<ChatAgentEvent, void, void> {
    const typed = normalizeChatBody(body);
    // A file may carry the question alone; what it says is checked once it has
    // actually been read.
    if (!typed && attachments.length === 0) throw new ChatAgentError(400, 'اكتب سؤالك');

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
    // somewhere to say so — and a retry has a row to count itself on. Best-effort
    // on purpose: the deploy that introduces this lands before the migration that
    // creates the table, and a diagnostics row must never be able to refuse the
    // member an answer (or leak their allowance).
    const turnId = await this.deps.agent
      .startTurn(conversationId, userId, typed)
      .catch((error: unknown) => {
        logger.warn('Assistant turn record could not be opened', { error: String(error) });
        return null;
      });

    try {
      // A voice note is transcribed, an image reaches the model as an image part,
      // and a text file as text — while the recording and the file stay attached,
      // so the member still hears (and sees) what they sent (ADR-0126, ADR-0127).
      const read = await this.readAttachments(attachments);
      const question = [typed, read.words].filter(Boolean).join('\n');
      if (!question && read.parts.length === 0) throw new ChatAgentError(422, COULD_NOT_READ);

      // A voice note's words are only known now, and the row should say what the
      // turn actually answered. Best effort: the recording still runs the turn.
      if (turnId && question !== typed) {
        await this.deps.agent.setTurnQuestion(turnId, question).catch(() => undefined);
      }

      const sent = await this.deps.chats.sendMessage(userId, conversationId, {
        body: question,
        ...(attachments.length > 0 ? { attachments } : {}),
      });

      const page = await this.deps.chats.listMessages(userId, conversationId, null);
      yield* this.answer({
        userId,
        conversationId,
        turnId,
        context,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          ...(read.spoken ? [{ role: 'system' as const, content: SPOKEN_NOTE }] : []),
          // The line just stored is replaced by its own reading, so an image or a
          // file reaches the model as a part rather than as an empty body.
          ...trimHistory(page.messages.filter((message) => message.id !== sent.id)),
          { role: 'user', content: read.parts.length > 0 ? read.parts : question },
        ],
      });
    } catch (error) {
      if (turnId) {
        await this.deps.agent
          .failTurn(turnId, {
            error: error instanceof Error ? error.message : String(error),
            partialText: error instanceof ChatAgentTurnFailure ? error.partialText : '',
          })
          .catch(() => undefined);
      }
      await reservation.release();
      throw error;
    }
  }

  /** The words in a voice note, or `null` when no model would transcribe it. */
  private async spokenQuestion(attachment: ChatAttachmentInput): Promise<string | null> {
    const audio = await this.deps.attachments.download(attachment.storagePath);
    if (!audio) throw new ChatAgentError(422, 'تعذّر قراءة التسجيل الصوتي. أعد إرساله.');

    const client = this.deps.client;
    if (!client) throw new ChatAgentError(503, UNAVAILABLE);

    const transcript = await client.transcribe(audio, attachment.mimeType);
    return transcript ? normalizeChatBody(transcript) : null;
  }

  /**
   * Everything the turn's files say, in the form the model reads (ADR-0127).
   *
   * Audio is transcribed into words — the recording itself is never sent to the
   * model — an image travels as an image part, and a text file as text. A file
   * no model can read is refused with a sentence rather than guessed at, and the
   * allowance the turn reserved is given back by the caller's catch.
   */
  private async readAttachments(attachments: ChatAttachmentInput[]): Promise<{
    /** What the member said out loud, as the message body. */
    words: string;
    /** The turn's content parts, in the order the files were staged. */
    parts: AiChatContentPart[];
    /** Whether at least one file was a recording. */
    spoken: boolean;
  }> {
    const words: string[] = [];
    const parts: AiChatContentPart[] = [];
    let spoken = false;

    for (const attachment of attachments) {
      if (chatAttachmentIsAudio(attachment.mimeType)) {
        const transcript = await this.spokenQuestion(attachment);
        if (!transcript) throw new ChatAgentError(422, COULD_NOT_TRANSCRIBE);
        words.push(transcript);
        parts.push({ type: 'text', text: `[${SPOKEN_LABEL}] ${transcript}` });
        spoken = true;
        continue;
      }

      const bytes = await this.deps.attachments.download(attachment.storagePath);
      if (!bytes) throw new ChatAgentError(422, COULD_NOT_READ);

      if (chatAttachmentIsInlineImage(attachment.mimeType)) {
        // A base64 image travels inside the request body, so the provider's own
        // ceiling — not the bucket's — is what an oversized picture would hit,
        // and it would hit it as an opaque 413 rather than a sentence.
        if (bytes.byteLength > ATTACHMENT_IMAGE_MAX) throw new ChatAgentError(422, IMAGE_TOO_LARGE);
        parts.push({
          type: 'image_url',
          image_url: {
            url: `data:${attachment.mimeType};base64,${Buffer.from(bytes).toString('base64')}`,
          },
        });
        continue;
      }

      if (chatAttachmentIsReadableText(attachment.mimeType)) {
        const text = new TextDecoder().decode(bytes).slice(0, ATTACHMENT_TEXT_MAX);
        parts.push({ type: 'text', text: `[${attachment.fileName}]\n${text}` });
        continue;
      }

      throw new ChatAgentError(422, UNREADABLE_FILE);
    }

    return { words: words.join('\n'), parts, spoken };
  }

  /**
   * The same answer, for a turn whose request is gone.
   *
   * Nothing is taken twice: the member's message is already in the thread, and the
   * allowance was reserved by the request that started the turn. The caller has
   * claimed the row, and it acts as the member through a session this server
   * minted for them — never a copy of the browser's (`docs/security.md`).
   */
  async *resume(
    turn: AgentTurnRow,
    context: ChatAgentTurnContext
  ): AsyncGenerator<ChatAgentEvent, void, void> {
    if (!this.deps.client) throw new ChatAgentError(503, UNAVAILABLE);

    const page = await this.deps.chats.listMessages(turn.memberId, turn.conversationId, null);
    try {
      yield* this.answer({
        userId: turn.memberId,
        conversationId: turn.conversationId,
        turnId: turn.id,
        context,
        messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...trimHistory(page.messages)],
      });
    } catch (error) {
      await this.deps.agent
        .failTurn(turn.id, {
          error: error instanceof Error ? error.message : String(error),
          partialText: error instanceof ChatAgentTurnFailure ? error.partialText : '',
        })
        .catch(() => undefined);
      throw error;
    }
  }

  /**
   * The rounds, the retry and the row's ending, shared by both entries so a
   * resumed turn behaves exactly like one the member is watching.
   */
  private async *answer({
    userId,
    conversationId,
    turnId,
    messages,
    context,
  }: {
    userId: string;
    conversationId: string;
    turnId: string | null;
    messages: AiChatWireMessage[];
    context: ChatAgentTurnContext;
  }): AsyncGenerator<ChatAgentEvent, void, void> {
    const client = this.deps.client;
    if (!client) throw new ChatAgentError(503, UNAVAILABLE);

    const tools = chatAgentToolDefinitions();
    const deadline = Date.now() + CHAT_AGENT_TURN_TIMEOUT_MS;
    let answerText = '';
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
              answerText += event.text;
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
            answerText === '' &&
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
            const proposal = await this.deps.actions.propose(conversationId, tool.name, args ?? {});
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
            messages.push(toolAnswer(call.id, result, tool.maxResultChars));
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
      const failure = classifiedFailure(error, answerText);
      // A refused credential is the deployment's fault, not the member's: it is
      // logged as an error so it reaches the operator's alerts instead of the
      // turn-by-turn warnings.
      const refused =
        error instanceof AiChatProviderError && (error.status === 401 || error.status === 403);
      const line = { error: String(error), turn: turnId };
      if (refused) logger.error('Assistant turn refused a credential', line);
      else logger.warn('Assistant turn failed', line);
      throw failure;
    }

    const text = answerText.trim() || ROUNDS_EXHAUSTED;
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
  }
}

/** A failed turn, in the one sentence its stream carries to the composer. */
function classifiedFailure(error: unknown, partialText: string): ChatAgentTurnFailure {
  // A refusal the operator's key caused (401/403) is not the member's to retry:
  // "try again" on a deployment whose provider key is wrong is advice that can
  // never work, and it hides a fault the operator has to see.
  if (error instanceof AiChatProviderError && (error.status === 401 || error.status === 403)) {
    return new ChatAgentTurnFailure(502, UNAVAILABLE, partialText);
  }

  return new ChatAgentTurnFailure(
    502,
    error instanceof AiChatProviderError && (error.status === 402 || error.status === 429)
      ? 'المساعد مشغول الآن، حاول بعد قليل.'
      : COULD_NOT_ANSWER,
    partialText
  );
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
function toolAnswer(callId: string, value: unknown, maxChars = 4_000): AiChatWireMessage {
  let content: string;
  try {
    content = JSON.stringify(value ?? null);
  } catch {
    content = '{"error":"تعذّر تمثيل نتيجة الأداة"}';
  }
  return { role: 'tool', tool_call_id: callId, content: content.slice(0, maxChars) };
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
