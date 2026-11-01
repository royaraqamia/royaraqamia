/**
 * The plain-text projection of a note's Markdown, the name the list shows it
 * under, and the normalisation search compares with.
 *
 * The list never renders Markdown as HTML — a one-line name and a two-line
 * preview are all it needs — so this is deliberately a stripper, not a parser:
 * fenced code keeps its contents, links keep their label, and the markers that
 * only exist for formatting disappear.
 */

const IMAGE = /!\[([^\]]*)\]\([^)]*\)/g;
const LINK = /\[([^\]]*)\]\([^)]*\)/g;
const FENCE = /^(\s*)(```|~~~)[^\n]*$/gm;
const HEADING = /^\s{0,3}#{1,6}\s+/gm;
const BLOCKQUOTE = /^\s{0,3}>\s?/gm;
const LIST_MARKER = /^\s{0,3}(?:[-*+]|\d+[.)])\s+/gm;
const RULE = /^\s{0,3}(?:[-*_]\s*){3,}$/gm;
const EMPHASIS = /(\*\*|__|\*|_|~~|`)/g;

export function markdownToPlainText(markdown: string): string {
  return stripHtmlTags(markdown)
    .replace(FENCE, '')
    .replace(IMAGE, '$1')
    .replace(LINK, '$1')
    .replace(HEADING, '')
    .replace(BLOCKQUOTE, '')
    .replace(LIST_MARKER, '')
    .replace(RULE, '')
    .replace(EMPHASIS, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Drops HTML tag spans from a single left-to-right pass.
 *
 * A preview is text in React, never markup, so this only keeps a pasted tag from
 * showing up as `<b>`; a replace-based tag regex can be defeated by a nested
 * `<scr<script>ipt>`, so the scan walks the string once and removes every span
 * that starts a tag. A comparison such as `1 < 2 > 0` is left alone: `<` starts
 * a tag only when a name or a closing slash follows it (CodeQL
 * js/incomplete-multi-character-sanitization).
 */
function stripHtmlTags(value: string): string {
  let output = '';
  let index = 0;
  while (index < value.length) {
    const char = value[index];
    if (char === '<' && /[a-z/]/i.test(value[index + 1] ?? '')) {
      const close = value.indexOf('>', index + 1);
      if (close !== -1) {
        index = close + 1;
        continue;
      }
    }
    output += char;
    index += 1;
  }
  return output;
}

/**
 * The comparison form: Arabic diacritics, tatweel and the alef/ya variants are
 * folded so a reader who types «صلاة» finds «الصَّلاة», and Latin text is
 * lowercased. The stored note is untouched.
 */
export function normalizeForSearch(value: string): string {
  return value
    .toLowerCase()
    .replace(/[\u064B-\u0652\u0670\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ئ/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ء/g, '')
    .replace(/ة/g, 'ه');
}

/** What the list matches a query against. A note is its body (ADR-0110). */
export function noteSearchText(note: { body: string }): string {
  return normalizeForSearch(markdownToPlainText(note.body));
}

/**
 * The first line that says something, which is the name a note is listed under:
 * the line the writer typed first, with its Markdown markers gone. Reading it
 * off the raw body rather than the flattened projection is what keeps a name
 * from swallowing the whole note.
 */
export function noteName(body: string, max = 120): string {
  for (const line of body.split('\n')) {
    const text = markdownToPlainText(line);
    if (text === '') continue;
    return text.length > max ? `${text.slice(0, max).trimEnd()}…` : text;
  }
  return '';
}

/**
 * The two-line preview the list shows under the name — the rest of the body, so
 * the name is not printed twice in one row.
 */
export function notePreview(body: string, max = 160): string {
  const lines = body.split('\n');
  const first = lines.findIndex((line) => markdownToPlainText(line) !== '');
  if (first === -1) return '';

  const text = markdownToPlainText(lines.slice(first + 1).join('\n'));
  if (text.length <= max) return text;
  return `${text.slice(0, max).trimEnd()}…`;
}
