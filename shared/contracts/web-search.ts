import { z } from 'zod';

/**
 * The web the assistant may read (ADR-0205).
 *
 * One search is bounded on both ends: the vendor returns at most five results,
 * and only the three with the fullest text reach the model. The numbers live
 * here because the client, the tool and the turn all have to agree on them —
 * a search that returned five sources and a turn cap of three would be two
 * different promises to the model and to the member.
 */

/** What the vendor is asked for. More than we use, so a thin result costs nothing. */
export const WEB_SEARCH_MAX_RESULTS = 5;

/** The sources whose text reaches the model, and the most a reply may cite. */
export const WEB_SEARCH_EVIDENCE_SOURCES = 3;

/** Chunks the vendor returns per source. Its own ceiling is three. */
export const WEB_SEARCH_CHUNKS_PER_SOURCE = 3;

/** The whole evidence block, in characters: about 1,250 tokens. */
export const WEB_SEARCH_EVIDENCE_CHARS = 5_000;

/**
 * What the turn's history gives up when the search tool is declared. The
 * assistant's budget does not rise (docs/assistant/roadmap.md); the window
 * shrinks to pay for the evidence.
 */
export const WEB_SEARCH_TOKEN_RESERVE = 1_300;

/** The search's own ceiling, inside the turn's 55 seconds. */
export const WEB_SEARCH_TIMEOUT_MS = 4_000;

/** A query is a sentence, not an essay, and not a word the index cannot use. */
export const WEB_SEARCH_QUERY_MIN = 3;
export const WEB_SEARCH_QUERY_MAX = 300;

/** One source, as the card and the stored row carry it. */
export const ChatMessageSourceSchema = z.object({
  url: z.string(),
  title: z.string(),
  /** The host the member reads; `www.` is not part of a publisher's name. */
  domain: z.string(),
  /** The vendor's best estimate, or null when it could not detect one. */
  publishedDate: z.string().nullable(),
});

export type WebSource = z.infer<typeof ChatMessageSourceSchema>;

/** What a search hands the turn: the sources, and the text the model reads. */
export interface WebSearchResult {
  sources: WebSource[];
  /** Already numbered to match `sources`, one labeled block per source. */
  evidence: string;
}

/**
 * Why a search did not answer. The turn maps every kind to the same sentence —
 * the member is owed "not now", never a vendor's status code — but the kind is
 * what the operator's log separates.
 */
export const WEB_SEARCH_ERROR_KINDS = [
  'rate_limited',
  'plan_limit',
  'timeout',
  'refused',
  'unavailable',
] as const;

export type WebSearchErrorKind = (typeof WEB_SEARCH_ERROR_KINDS)[number];

export class WebSearchError extends Error {
  constructor(
    readonly kind: WebSearchErrorKind,
    message: string
  ) {
    super(message);
    this.name = 'WebSearchError';
  }
}

/** The one sentence the model is handed when a search cannot run. */
export const WEB_SEARCH_UNAVAILABLE = 'تعذّر البحث في الويب الآن.';
