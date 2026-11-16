/**
 * The embedding generation behind recall (ADR-0185 decisions 1, 4 and 6,
 * ADR-0182 decision 3, #1425).
 *
 * Two things here are fixed on purpose, and neither is a tuning knob:
 *
 * - The width. `agent_memory_embeddings.embedding` is `vector(1536)`, so a model
 *   that answers another width cannot be stored at all — Postgres refuses the
 *   write rather than mixing two spaces in one index. That is why a dimension
 *   change is a new table generation and a backfill (decision 6), not an
 *   in-place reindex: the old table keeps answering while the new one fills.
 * - The batch. Vectors are written when a row is written, never on a turn's
 *   read path (decision 5), so the write is one provider call for many rows.
 *
 * `AI_EMBEDDING_DIMENSIONS` is read against `dimensions` below. A deployment
 * that configures a different width is not broken and not guessed at: the
 * embedding path switches itself off, recall falls back to lexical, and the
 * operator reads one warning.
 */

import { DAMASCUS_TIME_ZONE } from '@/shared/time';

export const EMBEDDING_GENERATION = {
  /** Where the vectors live. A new width is a new table, not the same one reindexed. */
  table: 'agent_memory_embeddings',
  /** The fixed width of `embedding`; an index needs it known at DDL time. */
  dimensions: 1536,
} as const;

/** Rows per provider call. One write of a batch, never one call per row. */
export const EMBEDDING_BATCH_SIZE = 32;

/** Recall takes at most six items, with their source (ADR-0182 decision 3). */
export const RECALL_MAX_ITEMS = 6;

/**
 * The cosine similarity a candidate must clear to be injected at all.
 *
 * A floor is what makes "unrelated message injects nothing" true rather than
 * hopeful: the nearest six of any member always exist, and a top-k without a
 * floor is a confident answer built on the wrong facts. The number is a starting
 * measurement, not a tuning knob for a prompt; the six-item cap and this floor
 * are what #1455 costs, and a change to either is a measurement.
 */
export const RECALL_SIMILARITY_FLOOR = 0.35;

/** A fact's ranking weight halves every this many days. */
export const RECALL_HALF_LIFE_DAYS = 30;

/**
 * Candidate rows asked of the function before the floor and the decay choose.
 *
 * Six is the cap on what is *injected*, not on what is *read*: filtering a
 * six-row answer by a floor would leave an injected set that depends on which
 * unrelated facts happened to rank first. The function clamps to this same
 * number (24), so the two cannot drift apart.
 */
export const RECALL_CANDIDATES = 24;

/**
 * The read path's own provider budget. Past this the turn answers without
 * recall: recall sits in front of the stream, so a hanging embeddings provider
 * must cost a bounded pause, not the member's turn.
 */
export const RECALL_QUERY_TIMEOUT_MS = 2500;

/** A fact is 1–500 characters, so this only guards a provider's own limit. */
export const EMBEDDING_MAX_INPUT_CHARS = 2000;

/**
 * What a vector describes. `fact` is the only source, and the only one this
 * store should have (ADR-0182's 2026-11-15 amendment, #1529): the thread summary
 * is context injected into the turn, not a recall item. A vector of it would
 * return what the prompt already holds, and a superseded summary would come back
 * with the same confidence as the current one.
 */
export type EmbeddingSourceKind = 'fact';

/** One row waiting for a vector: the memory and the text it was built from. */
export interface EmbeddingSource {
  kind: EmbeddingSourceKind;
  id: string;
  userId: string;
  text: string;
  /** The fact's `updated_at` at read time: the vector is stale when it moves. */
  sourceUpdatedAt: string;
}

/** One vector to store. `sourceUpdatedAt` is what the vector was built from. */
export interface EmbeddingWrite {
  kind: EmbeddingSourceKind;
  id: string;
  userId: string;
  model: string;
  sourceUpdatedAt: string;
  embedding: number[];
}

/** What a stored vector was made of, for the operator's report. */
export interface EmbeddingCounts {
  /** Rows the generation holds. */
  stored: number;
  /** Rows still waiting, or stale after an edit. */
  pending: number;
}

/** Why a backfill stopped before the queue was empty. */
export type BackfillStop = 'done' | 'provider' | 'batch-limit';

/** The one line the operator reads after `npm run embeddings:backfill`. */
export interface BackfillReport {
  embedded: number;
  batches: number;
  stopped: BackfillStop;
  /** What was left when the run ended; only a `provider` stop means it is blocked. */
  pending: number;
}

/** A fact recall may inject, with the score that put it there. */
export interface RecalledMemory {
  memoryId: string;
  text: string;
  /** Cosine similarity in 0–1; the floor and the recency decay are #1426's. */
  similarity: number;
  updatedAt: string;
}

/** What a recall query is scoped to: the thread it is asked in, and its product. */
export interface RecallScope {
  threadId: string;
  /** The product the member is looking at, when the turn knows it. */
  product: string | null;
}

/**
 * A candidate's ranking weight: the similarity, aged by the half-life.
 *
 * The floor is applied to `similarity` alone; this only orders the survivors, so
 * an old fact is not dropped for being old. It is not a probability and not a
 * score the model sees — it decides which six of the survivors are injected.
 */
export function recallScore(item: RecalledMemory, now: number): number {
  const at = Date.parse(item.updatedAt);
  const ageDays = Number.isFinite(at) ? Math.max(0, (now - at) / 86_400_000) : 0;
  const decay = Math.pow(0.5, ageDays / RECALL_HALF_LIFE_DAYS);
  return item.similarity * decay;
}

/**
 * The items a turn injects: below the floor dropped, the rest ordered by decayed
 * similarity, and never more than the cap however many the function answered.
 */
export function rankRecall(
  candidates: readonly RecalledMemory[],
  now: number = Date.now(),
  max: number = RECALL_MAX_ITEMS
): RecalledMemory[] {
  const cap = Math.min(Math.max(0, Math.floor(max)), RECALL_MAX_ITEMS);
  if (cap === 0) return [];

  return candidates
    .filter(
      (item) => Number.isFinite(item.similarity) && item.similarity >= RECALL_SIMILARITY_FLOOR
    )
    .sort((left, right) => {
      const byScore = recallScore(right, now) - recallScore(left, now);
      if (byScore !== 0) return byScore;
      const bySimilarity = right.similarity - left.similarity;
      if (bySimilarity !== 0) return bySimilarity;
      return (Date.parse(right.updatedAt) || 0) - (Date.parse(left.updatedAt) || 0);
    })
    .slice(0, cap);
}

/**
 * The line above each injected item, so the model can attribute it and a bad
 * recall is visible rather than silent (ADR-0182 decision 3).
 */
export const RECALL_BLOCK_HEADER =
  'هذه محفوظات العضو التي اخترتها لأنها تتصل بسؤاله. استخدمي منها ما يخصّه فقط، وانسبي كل بند إلى مصدره كما هو مكتوب.';

/** A fact's date as the member reads dates: «3 أكتوبر», never a raw timestamp. */
const RECALL_DATE = new Intl.DateTimeFormat('ar-SA-u-nu-latn', {
  day: 'numeric',
  month: 'long',
  calendar: 'gregory',
  timeZone: DAMASCUS_TIME_ZONE,
});

export function formatMemoryDate(value: string): string {
  const at = Date.parse(value);
  return Number.isFinite(at) ? RECALL_DATE.format(at) : '';
}

/** One injected item: the fact, then where it came from and when it was saved. */
export function recallLine(item: RecalledMemory): string {
  const date = formatMemoryDate(item.updatedAt);
  const source = date ? `من محادثتنا في ${date}` : 'من محفوظاتك';
  return `- «${item.text}» — ${source}`;
}

/** The one system block recall injects, or the empty string when it has nothing. */
export function recallBlock(items: readonly RecalledMemory[]): string {
  if (items.length === 0) return '';
  return [RECALL_BLOCK_HEADER, ...items.map(recallLine)].join('\n');
}

/**
 * The fact store's own contract (ADR-0182 decisions 2 and 5, #1509).
 *
 * A saved fact is a row the member owns: one door writes it, the member's own
 * session reads it back, and the row says what kind of thing it is so a health
 * or financial fact is visibly one and never inferred.
 */

/** `agent_memories.text`'s own check, mirrored so the refusal is a sentence. */
export const MEMORY_TEXT_MAX = 500;

export const AGENT_MEMORY_SCOPES = ['account', 'product', 'thread'] as const;
export type AgentMemoryScope = (typeof AGENT_MEMORY_SCOPES)[number];

export const AGENT_MEMORY_KINDS = ['fact', 'preference', 'health', 'legal', 'financial'] as const;
export type AgentMemoryKind = (typeof AGENT_MEMORY_KINDS)[number];

/** One saved fact, as the page and a turn both read it. */
export interface AgentMemory {
  id: string;
  scope: AgentMemoryScope;
  /** Set exactly when `scope = 'product'`. */
  product: string | null;
  /** Set exactly when `scope = 'thread'`. */
  threadId: string | null;
  kind: AgentMemoryKind;
  text: string;
  /** The turn it was written from, when the member did not type it into the page. */
  sourceTurnId: string | null;
  confidence: number;
  createdAt: string;
  updatedAt: string;
}

/** What every caller hands the one door: the tool today, extraction next. */
export interface RememberFactInput {
  userId: string;
  text: string;
  scope?: AgentMemoryScope;
  product?: string | null;
  threadId?: string | null;
  kind?: AgentMemoryKind;
  sourceTurnId?: string | null;
  /** 1.00 for an explicit `remember`; lower for extraction (decision 5). */
  confidence?: number;
}

/**
 * The member's switches, one per scope (ADR-0182 decision 6, #1428).
 *
 * On is the default and the missing-row answer: memory is the product's
 * promise, and a member who has never opened the page has not switched anything
 * off. Turning a scope off stops both halves — nothing new is saved there and
 * nothing already saved there is injected — and it never hides a fact from the
 * page, because a fact the member cannot see is a fact they cannot delete.
 */
export interface AgentMemorySettings {
  account: boolean;
  product: boolean;
  thread: boolean;
}

export const DEFAULT_MEMORY_SETTINGS: AgentMemorySettings = {
  account: true,
  product: true,
  thread: true,
};

/** One scope's switch, as the one door and the page both read it. */
export function scopeEnabled(settings: AgentMemorySettings, scope: AgentMemoryScope): boolean {
  return settings[scope];
}

/** The sentences the writer answers with, in the member's language. */
export const MEMORY_EMPTY = 'اكتب ما تريد أن أتذكّره.';
export const MEMORY_TOO_LONG = `الحد الأقصى للشيء الذي أتذكّره ${MEMORY_TEXT_MAX} حرفاً.`;
export const MEMORY_INVALID_KIND = 'نوع الحفظ غير معروف.';
export const MEMORY_SCOPE_KEY = 'نطاق الحفظ لا يطابق مفتاحه.';
export const MEMORY_SCOPE_OFF = 'أوقفت الحفظ في هذا النطاق، فلن أحفظ فيه شيئاً.';
export const MEMORY_REFUSED_SENTENCE = 'لا أحفظ كلمات المرور ولا الرموز ولا بيانات البطاقات.';

/**
 * What the writer refuses before any row exists (decision 5).
 *
 * The list is deterministic on purpose. A prompt that asks the model not to
 * store a card number is a wish; a check here is the rule. Another member's data
 * is not detectable from text, so it is the extraction schema's job (#1511) —
 * this list covers the shapes that are detectable and are never worth storing.
 *
 * The patterns are deliberately narrow: a member who says "نسيت كلمة المرور"
 * asked for something, so the word alone does not refuse the fact; a value
 * handed over does.
 */
const CREDENTIAL_PATTERNS: readonly RegExp[] = [
  // A secret with a value: password: …, كلمة المرور هي …, an OTP.
  /(?:password|passwd|\bpwd\b|كلمة\s*(?:ال)?مرور|كلمة\s*(?:ال)?سر|رمز\s*(?:ال)?دخول)\s*(?:[:=]|هي|هو)\s*\S/i,
  /(?:رمز\s*(?:ال)?تحقق|\botp\b)\s*(?:[:=]|هو|هي)\s*\S/i,
  // Provider tokens, and the header that carries one.
  /\bsk-[A-Za-z0-9_-]{8,}/,
  /\b(?:ghp|gho|ghs|ghu)_[A-Za-z0-9]{16,}/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bbearer\s+[A-Za-z0-9._-]{16,}/i,
  // A JWT is three base64url parts and nothing else looks like one.
  /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/,
  // A card's security code, and an IBAN's country-code prefix.
  /\bcvv\b|\bcvc\b|رمز\s*(?:ال)?أمان/i,
  /\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/,
];

/** The Luhn check every real card number passes and a phone number does not. */
function passesLuhn(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let index = digits.length - 1; index >= 0; index -= 1) {
    let value = Number(digits[index]);
    if (double) {
      value *= 2;
      if (value > 9) value -= 9;
    }
    sum += value;
    double = !double;
  }
  return sum % 10 === 0;
}

function carriesCardNumber(text: string): boolean {
  // 13–19 digits, with the separators people type. Luhn decides, so a long
  // number that is not a card — a national id, an order number — still passes.
  for (const match of text.matchAll(/\b\d(?:[ -]?\d){12,18}\b/g)) {
    const digits = match[0].replace(/\D/g, '');
    if (passesLuhn(digits)) return true;
  }
  return false;
}

/**
 * The refusal for a text that must never be stored, or `null` when it may be.
 * The sentence is what the member reads, so it is returned rather than thrown.
 */
export function memoryRefusal(text: string): string | null {
  for (const pattern of CREDENTIAL_PATTERNS) {
    if (pattern.test(text)) return MEMORY_REFUSED_SENTENCE;
  }
  return carriesCardNumber(text) ? MEMORY_REFUSED_SENTENCE : null;
}
