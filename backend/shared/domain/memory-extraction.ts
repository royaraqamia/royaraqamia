import {
  AGENT_MEMORY_KINDS,
  MEMORY_TEXT_MAX,
  memoryRefusal,
  type AgentMemoryKind,
  type AgentMemoryScope,
} from '@/backend/shared/domain/agent-memory';

/**
 * Extraction after the answer (ADR-0182 decision 2, decision 5, #1511).
 *
 * The member did not type the fact, so every rule here is stricter than the
 * `remember` tool's: a closed schema, a floor, and — for the kinds decision 5
 * singles out — a verbatim sentence from the member's own message. Extraction
 * is a second caller of the fact service, never a second writer; this module
 * only decides *what* may be offered to that one door.
 */

/** At most three facts per turn: one answer is one exchange, not a profile. */
export const EXTRACTION_MAX_FACTS = 3;

/**
 * The confidence a fact must clear to be written at all.
 *
 * Below it nothing is stored — not stored-and-hidden. A row nobody can inject
 * is a row the page has to explain, and the member never asked for any of this.
 * The error costs are asymmetric: a false positive leaves a row the member has
 * to find and delete, a false negative costs a sentence they can repeat. That
 * is why this sits high, and why a change to it is a measurement.
 */
export const EXTRACTION_CONFIDENCE_FLOOR = 0.8;

/**
 * The provider budget for one extraction. The answer is already stored and the
 * turn is already settled, so a hanging provider costs a bounded pause in the
 * background and then one warning — never a member waiting.
 */
export const EXTRACTION_PROVIDER_TIMEOUT_MS = 6_000;

/** How much of each side of the exchange the extractor reads. */
export const EXTRACTION_EXCHANGE_MAX_CHARS = 2_000;

/**
 * The kinds decision 5 stores only when the member asked for them in the same
 * turn. The check is not a prompt instruction: the extractor must hand back the
 * sentence it read them from, and `parseExtractedFacts` looks for it in the
 * member's own message.
 */
export const SENSITIVE_MEMORY_KINDS = ['health', 'legal', 'financial'] as const;

export type SensitiveMemoryKind = (typeof SENSITIVE_MEMORY_KINDS)[number];

/** One fact the extractor offered and the parser accepted. */
export interface ExtractedFact {
  text: string;
  kind: AgentMemoryKind;
  scope: AgentMemoryScope;
  /** Set exactly when `scope = 'product'`. */
  product: string | null;
  /** Set exactly when `scope = 'thread'`. */
  threadId: string | null;
  confidence: number;
}

/** The keys a turn's scopes resolve to: its conversation, and its page's product. */
export interface ExtractionTarget {
  threadId: string;
  product: string | null;
}

export interface ExtractionExchange {
  /** What the member said in this turn. */
  question: string;
  /** What the assistant answered in this turn. */
  answer: string;
}

declare const settledTurnBrand: unique symbol;

/**
 * One settled turn, as extraction reads it.
 *
 * Branded so the only way to build one is the factory below, called inside the
 * turn that owns them: an extraction task cannot be handed a member id, a
 * thread id or a question from anywhere else. `source_turn_id` is the citation,
 * and the row it names is the authority for whose fact it is.
 */
export interface SettledTurn extends ExtractionExchange {
  readonly [settledTurnBrand]: true;
  readonly turnId: string;
  readonly userId: string;
  readonly conversationId: string;
  /** The product the page was on when the turn was asked; `null` when unknown. */
  readonly product: string | null;
}

export function settledTurn(parts: {
  turnId: string;
  userId: string;
  conversationId: string;
  question: string;
  answer: string;
  product: string | null;
}): SettledTurn {
  return parts as SettledTurn;
}

/** The extractor's instructions. JSON only, and the schema is restated in words. */
export const EXTRACTION_SYSTEM_PROMPT = [
  'تقرأ رسالة عضو وردّ المساعدة عليها، وتستخرج ما يستحق أن يُحفظ عن العضو نفسه في محفوظاته.',
  'أخرجي JSON فقط، بلا شرح ولا نصّ خارج الكائن:',
  '{"facts":[{"text":"...","kind":"fact|preference|health|legal|financial","scope":"account|product|thread","confidence":0.0,"evidence":"..."}]}',
  'القواعد:',
  '- ثلاثة حقائق كحد أقصى، والواحد يكفي. إن لم يكن في الرسالة ما يُحفظ فأخرجي {"facts":[]}.',
  `- النص عربي فصيح، جملة واحدة، من 1 إلى ${MEMORY_TEXT_MAX} حرفاً، بلا صياغة تذكّر أو إخبار بالحفظ.`,
  '- النوع من المجموعة المحددة فقط. النطاق account لما يخصّ العضو، وproduct لما يخصّ المنتج الذي يتحدث عنه، وthread لما يخصّ هذه المحادثة.',
  '- confidence رقم من 0 إلى 1: 0.9 لما قاله العضو صريحاً، ولا ترفعيه تخميناً.',
  '- الحقيقة الصحية أو القانونية أو المالية تُخرج فقط إذا طلب العضو في رسالته أن تُحفظ، ويكون evidence نصاً حرفياً من رسالته.',
  '- لا كلمات مرور ولا رموز دخول ولا بيانات بطاقات ولا بيانات عضو ثالث، أبداً.',
].join('\n');

function bounded(text: string): string {
  const trimmed = text.trim();
  return trimmed.length > EXTRACTION_EXCHANGE_MAX_CHARS
    ? trimmed.slice(trimmed.length - EXTRACTION_EXCHANGE_MAX_CHARS)
    : trimmed;
}

/** The one user message: the exchange as data, fenced so it cannot be read as rules. */
export function extractionPrompt(exchange: ExtractionExchange): string {
  return [
    'رسالة العضو:',
    '"""',
    bounded(exchange.question),
    '"""',
    '',
    'ردّ المساعدة:',
    '"""',
    bounded(exchange.answer),
    '"""',
  ].join('\n');
}

/**
 * The model's answer as JSON. A chat model wraps JSON in fences often enough
 * that refusing them would lose good extractions; anything else unreadable is
 * `null`, and `parseExtractedFacts` then writes nothing.
 */
export function parseExtractionJson(raw: string): unknown {
  const trimmed = raw.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  const body = fenced?.[1] ?? trimmed;
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

function normalised(value: string): string {
  return value.replace(/\s+/g, ' ').trim().toLocaleLowerCase();
}

function readsAsKind(value: unknown): AgentMemoryKind | null {
  return typeof value === 'string' && (AGENT_MEMORY_KINDS as readonly string[]).includes(value)
    ? (value as AgentMemoryKind)
    : null;
}

function readsAsScope(value: unknown): AgentMemoryScope | null {
  return value === 'account' || value === 'product' || value === 'thread'
    ? (value as AgentMemoryScope)
    : null;
}

function readsAsConfidence(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  if (value < 0 || value > 1) return null;
  return value;
}

/** A fact's text, in the shape the column and the page expect, or `null`. */
function readsAsText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.replace(/\s+/g, ' ').trim();
  if (text.length === 0 || text.length > MEMORY_TEXT_MAX) return null;
  if (memoryRefusal(text)) return null;
  return text;
}

/**
 * The sentence the extractor read a sensitive fact from must be in the member's
 * own message, not the answer and not invented. Compared on collapsed
 * whitespace and case, because a model re-spaces a quotation routinely.
 */
function quotesTheMember(evidence: unknown, question: string): boolean {
  if (typeof evidence !== 'string') return false;
  const quote = normalised(evidence);
  if (quote.length < 8) return false;
  return normalised(question).includes(quote);
}

function scopeOf(
  scope: AgentMemoryScope,
  target: ExtractionTarget
): { product: string | null; threadId: string | null } | null {
  if (scope === 'account') return { product: null, threadId: null };
  if (scope === 'thread') return { product: null, threadId: target.threadId };
  // A product-scoped fact needs the product the page said it was on. A turn
  // with no eyes cannot name one, and guessing one is worse than dropping it.
  return target.product ? { product: target.product, threadId: null } : null;
}

/**
 * The facts that may be offered to the write path, and nothing else.
 *
 * Every rule drops the whole fact rather than repairing it: a field outside the
 * schema is not a fact with a default. The floor is applied here, after parsing
 * and before any caller can write — an extraction that would store a row below
 * it writes nothing at all.
 */
export function parseExtractedFacts(
  raw: unknown,
  options: { target: ExtractionTarget; question: string }
): ExtractedFact[] {
  const list = Array.isArray(raw)
    ? raw
    : typeof raw === 'object' && raw !== null && Array.isArray((raw as { facts?: unknown }).facts)
      ? (raw as { facts: unknown[] }).facts
      : [];

  const facts: ExtractedFact[] = [];
  for (const candidate of list) {
    if (facts.length >= EXTRACTION_MAX_FACTS) break;
    if (typeof candidate !== 'object' || candidate === null) continue;

    const fact = candidate as {
      text?: unknown;
      kind?: unknown;
      scope?: unknown;
      confidence?: unknown;
      evidence?: unknown;
    };

    const text = readsAsText(fact.text);
    const kind = readsAsKind(fact.kind);
    const scope = readsAsScope(fact.scope);
    const confidence = readsAsConfidence(fact.confidence);
    if (text === null || kind === null || scope === null || confidence === null) continue;
    if (confidence < EXTRACTION_CONFIDENCE_FLOOR) continue;

    if (
      (SENSITIVE_MEMORY_KINDS as readonly string[]).includes(kind) &&
      !quotesTheMember(fact.evidence, options.question)
    ) {
      continue;
    }

    const keys = scopeOf(scope, options.target);
    if (keys === null) continue;

    facts.push({ text, kind, scope, product: keys.product, threadId: keys.threadId, confidence });
  }

  return facts;
}
