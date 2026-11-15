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

/** A fact is 1–500 characters, so this only guards a provider's own limit. */
export const EMBEDDING_MAX_INPUT_CHARS = 2000;

/**
 * What a vector describes. `fact` is the only source today; the thread summary
 * is the next one, and it arrives with the table that holds it (#1426) rather
 * than as a column nothing can fill.
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

/** The sentences the writer answers with, in the member's language. */
export const MEMORY_EMPTY = 'اكتب ما تريد أن أتذكّره.';
export const MEMORY_TOO_LONG = `الحد الأقصى للشيء الذي أتذكّره ${MEMORY_TEXT_MAX} حرفاً.`;
export const MEMORY_INVALID_KIND = 'نوع الحفظ غير معروف.';
export const MEMORY_SCOPE_KEY = 'نطاق الحفظ لا يطابق مفتاحه.';
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
