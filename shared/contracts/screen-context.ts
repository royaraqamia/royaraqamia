/**
 * What a turn knows about the screen the member is on (ADR-0181, decision 1).
 *
 * The assistant's eyes are not the DOM and not a screenshot: they are the
 * surface's own state, published by the surface and capped before it travels.
 * This module is the one place that says what that snapshot is, how big it may
 * get, and when it is allowed to leave the page. It carries no schema, because
 * the browser imports it too and a Zod parser in every page's bundle is not a
 * price the eyes are worth: the wire shape lives in `screen-context-schema.ts`,
 * which only the server and the turn's own tests read.
 *
 * The identity of a screen is the id `docs/mobile/screens.json` already gives
 * the surface, so the eyes and the two-client registry are one list rather than
 * two names for one page. The same list is what `perf/surfaces.json` routes to,
 * and `shared/contracts/screens.generated.ts` is that mapping, generated.
 *
 * A registration names itself `<surface>.<name>`: the part before the first dot
 * is that same surface id, and the name says which box registered — `news.page`
 * for the page, `spendtrack.expense` for its dialog, `quran-surah.tafsir` for the
 * panel beside an Ayah. The id is stable across a redraw, so the record in hand
 * goes in `focus`, never in the id. `npm run check:screens` reads the same
 * convention from the source: a registration that names a screen the registry
 * does not have fails there instead of reaching the model.
 */

/** A sheet, dialog or popover open above the screen. */
export interface ScreenContextOverlay {
  /** The overlay's own id, stable across a redraw. */
  id: string;
  /** What it is: `sheet`, `dialog`, `popover`. */
  kind: string;
}

/** The record the member has in hand, if any. */
export interface ScreenContextFocus {
  /** What kind of record: `note`, `expense`, `post`. */
  kind: string;
  id: string;
}

/**
 * One screen, as the surface publishes it.
 *
 * Everything here is the surface's own model, never a rendering of it: `fields`
 * is the allowlisted form state, `text` is the words the surface chooses to
 * quote, and neither is scraped. `route` is always present â€” a surface that
 * registers nothing is still visible by route, never invisible (decision 2).
 */
export interface ScreenContext {
  /** The pathname the member is on: `/spendtrack/expenses`. */
  route: string;
  /** The product the surface belongs to: `spendtrack`, `quran`, `site`. */
  product: string;
  /** The surface's id in the one registry: `spendtrack-categories`. Empty when
   * the path is not in the registry â€” a route-only snapshot, never a made-up id. */
  screenId: string;
  /** The screen's own title, as drawn. Empty when the screen has none. */
  title: string;
  /** Open sheets and dialogs, the topmost last. */
  overlays: ScreenContextOverlay[];
  /** The record in hand, or `null` when the member has none. */
  focus: ScreenContextFocus | null;
  /** The selected tab or chip, when the route has one. */
  tab: string | null;
  /** Allowlisted form fields only; the denylist is structural (#1419). */
  fields: Record<string, string>;
  /** A capped excerpt of what is on screen. */
  text: string;
  /** When the page settled, as ISO 8601. */
  updatedAt: string;
}

/**
 * The client saying it has no eyes here, rather than sending nothing.
 *
 * An admin surface publishes no snapshot at all (decision 8), and a surface may
 * opt out (decision 5). Both need the turn to say it cannot see the screen
 * instead of guessing, which is only possible when "opted out" is a thing the
 * client can say. A tab that sends no `screen` field at all is a client without
 * eyes â€” the turn then answers exactly as it did before this contract existed.
 */
export interface ScreenContextBlind {
  blind: true;
}

/** What a turn's request carries: a snapshot, or an explicit "not here". */
export type ScreenContextInput = ScreenContext | ScreenContextBlind;

/**
 * How long a page rests before its snapshot is sent: 300 ms, inside the
 * 250-400 ms window decision 3 names.
 *
 * The point is that a member typing in a form, opening a sheet and switching a
 * tab produces one snapshot rather than one per keystroke, and the model reads
 * the screen as it is by the time the question is asked.
 */
export const SCREEN_CONTEXT_SETTLE_MS = 300;

/**
 * The block's ceiling: about 600 tokens, at the same four characters per token
 * the identity block and the history trim use. A turn already spends its budget
 * on the thread, the tool declarations and the attachments, so the page's state
 * is capped rather than trusted (decision 3).
 */
export const SCREEN_CONTEXT_CHARS_MAX = 2_400;
export const SCREEN_CONTEXT_TOKEN_MAX = 600;

/** A path with a dynamic segment is bounded by its route table row, not this. */
export const SCREEN_CONTEXT_ROUTE_CHARS_MAX = 200;
export const SCREEN_CONTEXT_PRODUCT_CHARS_MAX = 40;
export const SCREEN_CONTEXT_SCREEN_ID_CHARS_MAX = 80;
export const SCREEN_CONTEXT_TITLE_CHARS_MAX = 120;
export const SCREEN_CONTEXT_TAB_CHARS_MAX = 40;
export const SCREEN_CONTEXT_TEXT_CHARS_MAX = 1_200;
export const SCREEN_CONTEXT_FIELD_KEY_CHARS_MAX = 64;
export const SCREEN_CONTEXT_FIELD_VALUE_CHARS_MAX = 120;
export const SCREEN_CONTEXT_FIELDS_MAX = 16;
export const SCREEN_CONTEXT_OVERLAYS_MAX = 6;
export const SCREEN_CONTEXT_OVERLAY_ID_CHARS_MAX = 80;
export const SCREEN_CONTEXT_OVERLAY_KIND_CHARS_MAX = 40;
export const SCREEN_CONTEXT_FOCUS_ID_CHARS_MAX = 120;
export const SCREEN_CONTEXT_FOCUS_KIND_CHARS_MAX = 40;

/**
 * One line, no control characters, no runs of whitespace.
 *
 * The snapshot is read by a language model and written by a page, so a newline
 * in a title is a new prompt line and a zero-width character is a way to hide
 * one. Both are removed here rather than trusted to every surface.
 *
 * The code points are listed rather than written as a character class because
 * `no-control-regex` is right to refuse one, and this is the one place in the
 * repo that genuinely means "every control character".
 */
const INVISIBLE = (code: number): boolean =>
  code <= 0x1f ||
  (code >= 0x7f && code <= 0x9f) ||
  (code >= 0x200b && code <= 0x200f) ||
  code === 0x2028 ||
  code === 0x2029 ||
  code === 0xfeff;

export function plainText(value: string): string {
  let out = '';
  for (const character of value) {
    out += INVISIBLE(character.codePointAt(0) ?? 0) ? ' ' : character;
  }
  return out.replace(/\s+/g, ' ').trim();
}

/** The client saying it has no eyes here: `{ blind: true }` and nothing else. */
export function isScreenContextBlind(input: ScreenContextInput): input is ScreenContextBlind {
  return (input as ScreenContextBlind).blind === true;
}
