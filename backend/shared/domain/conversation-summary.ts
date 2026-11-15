import { CHAT_AGENT_HISTORY_MAX } from '@/shared/contracts/chat';

/**
 * The window is summarised, not enlarged (ADR-0182 decision 4, #1512).
 *
 * `trimHistory` gives the model the last twenty messages and nothing above
 * them. That is a window, not a memory: on the twenty-first message the member
 * says what they had already decided and the assistant has no way to know. This
 * module is the other half — a rolling summary stored on the conversation,
 * regenerated as the thread grows past the window, and injected as its own
 * block beside identity and recall.
 *
 * Four rules are fixed here rather than in the service that calls it:
 *
 * - **A cursor, not a count.** What the summary has seen is a message id. A
 *   message deleted later takes the cursor with it (`on delete set null`) and
 *   the next regeneration starts from the beginning — it can never leave the
 *   summary claiming to have read a message that came after it.
 * - **Ten, not one.** One new message is already in the window, so a
 *   regeneration for it is a provider call that changes no answer. The summary
 *   is paid for once per ten messages, and only once the thread is past the
 *   window at all.
 * - **Bounded.** The input has a character ceiling and the summary has one too:
 *   a long thread is summarised in contiguous chunks, and the cursor advances
 *   to the last message the model actually read, never past it.
 * - **Prose, not memory.** The summary is injected as context. It is never the
 *   source of a saved fact, never a citable item, and never the member's words
 *   (decision 5, and #1512's "do not").
 */

/** How many messages past the cursor make a regeneration worth its call. */
export const SUMMARY_MIN_NEW_MESSAGES = 10;

/**
 * The summary's ceiling, in characters. The block is paid for on every turn it
 * is injected into, so it is bounded where it is written rather than trimmed
 * where it is read — a summary that silently lost its end would lose the newest
 * decision in it.
 */
export const SUMMARY_MAX_CHARS = 1_200;

/**
 * How much of the thread one regeneration reads. A thread that grew by more
 * than this is summarised over several regenerations, each one starting where
 * the last cursor stopped, so nothing between them is skipped.
 */
export const SUMMARY_INPUT_MAX_CHARS = 12_000;

/**
 * The most rows one regeneration reads, whatever their length. A guard against
 * a thread of one-word lines, not a policy: the character ceiling is what
 * bounds the provider call.
 */
export const SUMMARY_INPUT_MAX_MESSAGES = 200;

/**
 * The provider budget for one regeneration. It runs after the answer is stored
 * and the turn is settled, so a hanging provider costs a bounded pause in the
 * background and one warning — never a member waiting. Six seconds is the
 * ceiling the extraction behind the same `after()` seam already proved.
 */
export const SUMMARY_PROVIDER_TIMEOUT_MS = 6_000;

/**
 * What a conversation carries once a regeneration has succeeded. `updatedAt`
 * is the moment it was written, and `throughMessageId` is the cursor: the last
 * message the summary has read. `null` only on a conversation with no summary.
 */
export interface ConversationSummary {
  text: string;
  throughMessageId: string | null;
  updatedAt: string;
}

/** One message a regeneration reads, as the provider sees it. */
export interface SummaryMessage {
  id: string;
  senderKind: 'user' | 'agent' | 'system';
  body: string;
  createdAt: string;
}

/**
 * The line above the summary. It is the whole reason the block is safe: an
 * unlabelled paragraph of past conversation reads as something the member just
 * said, and the model then answers a sentence nobody asked.
 */
export const SUMMARY_BLOCK_HEADER =
  'هذا ملخّص للجزء السابق من هذه المحادثة، كتبه الخادم: هو ليس رسالة من العضو ولا كلاماً له.';

/** The line below it, so the summary is context and never an instruction. */
export const SUMMARY_BLOCK_FOOTER =
  'اقرئيه كسياق لما جرى قبل الرسائل أدناه، ولا تضيفي منه حقيقة لم تُقل ولا نصيحة، ولا تنسبي نصّه إلى العضو.';

/**
 * The one system block the summary injects, or the empty string when the
 * conversation has none. A summary that is blank space is no summary: a
 * conversation with nothing to say opens exactly as it did before this layer.
 */
export function summaryBlock(summary: ConversationSummary | null): string {
  const text = summary?.text.trim() ?? '';
  if (!text) return '';
  return [SUMMARY_BLOCK_HEADER, text, SUMMARY_BLOCK_FOOTER].join('\n');
}

/**
 * Whether a regeneration is worth a provider call.
 *
 * Two conditions, and each is a different mistake avoided. `total` past the
 * window means the summary has something to carry that the window does not;
 * before that the whole thread is already in the prompt and a summary would be
 * paid for nothing. `unseen` at ten means the last regeneration is still recent
 * enough that another one would rewrite the same paragraphs.
 */
export function summaryDue({ total, unseen }: { total: number; unseen: number }): boolean {
  return total > CHAT_AGENT_HISTORY_MAX && unseen >= SUMMARY_MIN_NEW_MESSAGES;
}

/**
 * The messages one regeneration reads: the oldest after the cursor, in order,
 * up to the character ceiling — and the id of the last one actually included.
 *
 * The order matters. Taking the newest messages would leave a hole between the
 * cursor and what was summarised, and the cursor could not then move without
 * silently dropping the middle of the thread. Oldest first means every
 * regeneration is contiguous, and a long thread is summarised over several of
 * them rather than at once.
 */
export function summaryChunk(messages: readonly SummaryMessage[]): {
  messages: SummaryMessage[];
  through: string | null;
  chars: number;
} {
  const included: SummaryMessage[] = [];
  let chars = 0;

  for (const message of messages) {
    if (included.length >= SUMMARY_INPUT_MAX_MESSAGES) break;
    // One message always goes in, however long it is: a chunk of nothing is a
    // regeneration that cannot move its cursor.
    if (included.length > 0 && chars + message.body.length > SUMMARY_INPUT_MAX_CHARS) break;
    included.push(message);
    chars += message.body.length;
  }

  return {
    messages: included,
    through: included.at(-1)?.id ?? null,
    chars,
  };
}

/** What the summariser is told, once per regeneration. */
export const SUMMARY_SYSTEM_PROMPT = [
  'تلخّصين رسائل من محادثة بين عضو ومساعدة، وتكتبين الملخّص للخادم وحده: لا يقرأه العضو ولا يُعاد إليه.',
  'القواعد:',
  '- اكتبي بالعربية الفصحى وبإيجاز، في فقرات قصيرة أو نقاط.',
  '- احفظي الأسماء والأرقام والقرارات والأسئلة التي بقيت مفتوحة.',
  '- لا تضيفي حقيقة لم تُقَل ولا نصيحة ولا تخميناً.',
  '- لا تكتبي مقدمة ولا خاتمة ولا تعليقاً على المهمة.',
  `- لا تتجاوزي ${SUMMARY_MAX_CHARS} حرفاً.`,
  '- الأرقام تُكتب دائماً بالأرقام اللاتينية (0-9).',
  '- لا كلمات مرور ولا رموز دخول ولا بيانات بطاقات.',
].join('\n');

const ROLE_LABELS: Record<SummaryMessage['senderKind'], string> = {
  user: 'العضو',
  agent: 'نور',
  system: 'النظام',
};

/** How one message reads inside the prompt: who said it, then what they said. */
function summaryLine(message: SummaryMessage): string {
  return `${ROLE_LABELS[message.senderKind]}: ${message.body}`;
}

/**
 * The one user message: the summary so far, then the messages it has not seen.
 * Both are fenced as data, so a member who types "تجاهلي ما سبق" is quoted
 * rather than obeyed.
 */
export function summaryPrompt(input: {
  previous: string;
  messages: readonly SummaryMessage[];
}): string {
  return [
    'الملخّص السابق (فارغ إن لم يكن هناك ملخّص):',
    '"""',
    input.previous.trim(),
    '"""',
    '',
    'رسائل جديدة لم يدخلها الملخّص بعد:',
    '"""',
    ...input.messages.map(summaryLine),
    '"""',
  ].join('\n');
}

/**
 * The model's answer as the summary column holds it, or `null` when it said
 * nothing usable. Blank lines are dropped and a run of spaces collapsed — a
 * model that answers with whitespace wrote no summary, and storing it would
 * replace a good one with an empty block.
 */
export function summaryText(raw: string): string | null {
  const text = raw
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');

  if (!text) return null;
  // The ceiling is also a column constraint, so this is the last defence rather
  // than the rule: a model that ignores the instruction still stores a row.
  return text.length > SUMMARY_MAX_CHARS ? `${text.slice(0, SUMMARY_MAX_CHARS - 1)}…` : text;
}
