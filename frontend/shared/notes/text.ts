/**
 * The plain-text projection of a note's Markdown, and the normalisation search
 * compares with.
 *
 * The list never renders Markdown as HTML — a two-line preview and a substring
 * match are all it needs — so this is deliberately a stripper, not a parser:
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
