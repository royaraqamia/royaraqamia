/**
 * Splitting written text into what can be pressed (ADR-0192).
 *
 * The product shows text in two kinds of place: Markdown documents the writer
 * authored (posts, notes) and plain conversation (chat, bios, excerpts). In both
 * a URL and an `@handle` should be something a reader can press, and the answer
 * to "what counts?" has to be the same everywhere or two surfaces disagree about
 * the same sentence.
 *
 * So this is a pure tokenizer, not a renderer: it names the spans, the caller
 * decides what an `@handle` becomes and whether it exists. Nothing here reaches
 * the network, which is what makes it testable and what lets a surface render the
 * text immediately and upgrade the mentions once the answer arrives.
 *
 * Deliberate exclusions:
 * - No `mailto:` guessing. An address in a message is text unless it is written
 *   as a URL; turning `name@example.com` into a press would mail a stranger from
 *   a sentence that was not talking to them.
 * - No bare-domain guessing outside a known TLD list. `v1.2`, `e.g.` and
 *   `node.js` are not links, and a rule that links them is worse than a rule that
 *   misses `mysite.dev` until it is written with `www.` or a scheme.
 * - No hashtags. The product has no route behind one.
 */

/**
 * A known top-level domain, the only domains a bare `host.tld` may end in. One
 * string rather than a literal array: this list ships to every route that can
 * show a card, and its punctuation is weight.
 */
const BARE_DOMAIN_TLDS = new Set(
  'ae ai app at au be bh blog ca cc ch cn co com cz de dev dk dz edu eg es fi fm fr gov gr hk id ie in info io iq ir it jo jp ke kw lb live ly ma me media mx my net news ng nl no nz om online org pk pl pt qa ru sa se sg sh shop site store sd tech tn to tr tv uk us xyz ye za'.split(
    ' '
  )
);

/** What may trail a URL without belonging to it. */
const TRAILING_PUNCTUATION = '.,;:!?؟،؛»«"\'…';

/**
 * Characters that end a run of text: a URL never spans a space or a quote, and
 * Arabic comma/semicolon end a sentence the same way Latin ones do.
 */
const URL_STOP = /[\s<>"'`«»]/;

/** `@` at a word boundary, then a handle the schema would accept. */
const MENTION = /(^|[^\p{L}\p{N}@_])@([\p{L}\p{N}-]{3,30})/gu;

/** A handle as `UsernameSchema` allows it: lowercase-able, no edge hyphen. */
const HANDLE_SHAPE = /^[\p{L}\p{N}][\p{L}\p{N}-]*[\p{L}\p{N}]$/u;

export type TextToken =
  | { kind: 'text'; value: string }
  | { kind: 'url'; value: string; href: string }
  | { kind: 'mention'; value: string; handle: string };

/**
 * The end of a URL that starts at `start`, or -1 when there is none.
 *
 * Scanning beats one clever regular expression here: the closing character of a
 * URL depends on what it opened (`…/Foo_(bar)` keeps its parenthesis) and on the
 * sentence around it, and a reader can never debug the single expression that
 * gets both right.
 */
function scanUrl(text: string, start: number): number {
  let end = start;
  while (end < text.length && !URL_STOP.test(text[end] ?? '')) end += 1;

  // Trailing punctuation belongs to the sentence, not to the address — but a
  // `)` that closes a `(` inside the URL does belong to it.
  while (end > start) {
    const last = text[end - 1] ?? '';
    if (TRAILING_PUNCTUATION.includes(last)) {
      end -= 1;
      continue;
    }
    if (last === ')') {
      const segment = text.slice(start, end);
      if (count(segment, '(') < count(segment, ')')) {
        end -= 1;
        continue;
      }
    }
    if (last === ']') {
      const segment = text.slice(start, end);
      if (count(segment, '[') < count(segment, ']')) {
        end -= 1;
        continue;
      }
    }
    break;
  }

  return end > start ? end : -1;
}

function count(value: string, character: string): number {
  let seen = 0;
  for (const char of value) if (char === character) seen += 1;
  return seen;
}

/** `www.` and scheme URLs are links once they end in a host; a bare domain needs a known TLD. */
function urlAt(text: string, index: number): { end: number; href: string } | null {
  const rest = text.slice(index);
  const scheme = /^https?:\/\//i.exec(rest);
  const www = /^www\./i.exec(rest);

  if (!scheme && !www) {
    // A bare domain: host.tld[/path]
    const domain = /^[\p{L}\p{N}][\p{L}\p{N}-]*(?:\.[\p{L}\p{N}-]+)+/u.exec(rest);
    if (!domain) return null;
    const tld = domain[0].slice(domain[0].lastIndexOf('.') + 1).toLowerCase();
    if (!BARE_DOMAIN_TLDS.has(tld)) return null;
    // A bare domain has to be the start of a word, not the tail of one.
    const before = text[index - 1] ?? '';
    if (before && !/[\s(«"'[]/.test(before)) return null;
  }

  const end = scanUrl(text, index);
  if (end === -1) return null;

  const value = text.slice(index, end);
  // `https://` with nothing after it, or `www.` alone, is not an address.
  if (
    !/[a-z0-9\u0621-\u064A]/i.test(
      www ? value.slice(4) : scheme ? value.slice(scheme[0].length) : value
    )
  ) {
    return null;
  }

  const href = scheme ? value : `https://${value}`;
  return { end, href };
}

/**
 * The text as a run of tokens: plain spans, URLs and `@handles`.
 *
 * `mention` tokens carry the lower-cased handle the caller may resolve; they stay
 * pressable only if the caller finds a member behind them.
 */
export function tokenizeText(text: string): TextToken[] {
  if (!text) return [];

  const tokens: TextToken[] = [];
  let plainFrom = 0;
  let index = 0;

  const pushPlain = (until: number) => {
    if (until <= plainFrom) return;
    tokens.push({ kind: 'text', value: text.slice(plainFrom, until) });
  };

  while (index < text.length) {
    const char = text[index];

    if (
      char === 'h' ||
      char === 'H' ||
      char === 'w' ||
      char === 'W' ||
      /[\p{L}\p{N}]/u.test(char ?? '')
    ) {
      const url = urlAt(text, index);
      if (url) {
        pushPlain(index);
        tokens.push({ kind: 'url', value: text.slice(index, url.end), href: url.href });
        index = url.end;
        plainFrom = index;
        continue;
      }
    }

    if (char === '@') {
      MENTION.lastIndex = 0;
      // The pattern needs the character before the `@`; anchor it at the `@` by
      // testing the slice that starts one character earlier.
      const from = index === 0 ? index : index - 1;
      const match = MENTION.exec(text.slice(from));
      const consumed = match && match.index === 0 ? match[0] : null;
      if (consumed) {
        const handle = match![2]!;
        const at = from + consumed.indexOf('@');
        if (at === index && HANDLE_SHAPE.test(handle)) {
          pushPlain(index);
          tokens.push({ kind: 'mention', value: `@${handle}`, handle: handle.toLowerCase() });
          index += 1 + handle.length;
          plainFrom = index;
          continue;
        }
      }
    }

    index += 1;
  }

  pushPlain(text.length);
  return tokens;
}

/** Every handle the text mentions, lower-cased and unique, for one lookup. */
export function mentionedHandles(text: string): string[] {
  const handles = new Set<string>();
  for (const token of tokenizeText(text)) {
    if (token.kind === 'mention') handles.add(token.handle);
  }
  return [...handles];
}
