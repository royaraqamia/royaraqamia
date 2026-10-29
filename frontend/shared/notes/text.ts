/**
 * The plain-text projection of a note's Markdown, and the normalisation search
 * compares with.
 *
 * The list never renders Markdown as HTML — a two-line preview and a substring
 * match are all it needs — so this is deliberately a stripper, not a parser:
 * fenced code keeps its contents, links keep their label, and the markers that
 * only exist for formatting disappear.
 */

const HTML_TAG = /<\/?[a-z][^>]*>/gi;
const IMAGE = /!\[([^\]]*)\]\([^)]*\)/g;
const LINK = /\[([^\]]*)\]\([^)]*\)/g;
const FENCE = /^(\s*)(```|~~~)[^\n]*$/gm;
const HEADING = /^\s{0,3}#{1,6}\s+/gm;
const BLOCKQUOTE = /^\s{0,3}>\s?/gm;
const LIST_MARKER = /^\s{0,3}(?:[-*+]|\d+[.)])\s+/gm;
const RULE = /^\s{0,3}(?:[-*_]\s*){3,}$/gm;
const EMPHASIS = /(\*\*|__|\*|_|~~|`)/g;

export function markdownToPlainText(markdown: string): string {
  return markdown
    .replace(FENCE, '')
    .replace(IMAGE, '$1')
    .replace(LINK, '$1')
    .replace(HTML_TAG, '')
    .replace(HEADING, '')
    .replace(BLOCKQUOTE, '')
    .replace(LIST_MARKER, '')
    .replace(RULE, '')
    .replace(EMPHASIS, '')
    .replace(/\s+/g, ' ')
    .trim();
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

/** What the list matches a query against. */
export function noteSearchText(note: { title: string; body: string }): string {
  return normalizeForSearch(`${note.title} ${markdownToPlainText(note.body)}`);
}

/** The two-line preview the list shows under a title. */
export function notePreview(body: string, max = 160): string {
  const text = markdownToPlainText(body);
  if (text.length <= max) return text;
  return `${text.slice(0, max).trimEnd()}…`;
}
