export function stripMarkdown(text: string): string {
  const sanitizeOnce = (value: string): string =>
    value
      .replace(/[<>]/g, ' ')
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/!\[.*?\]\(.*?\)/g, ' ')
      .replace(/\[([^\]]*)\]\(.*?\)/g, ' ')
      .replace(/^#{1,6}\s+/gm, '')
      .replace(/[*_]{2}([^*_]+)[*_]{2}/g, '$1')
      .replace(/[*_]([^*_]+)[*_]/g, '$1')
      .replace(/~~([^~]+)~~/g, '$1')
      .replace(/`[^`]*`/g, ' ')
      .replace(/^>\s+/gm, ' ')
      .replace(/^[-*+]\s+/gm, ' ')
      .replace(/^\d+\.\s+/gm, ' ')
      .replace(/^[-*_]{3,}\s*$/gm, ' ')
      .replace(/[|]/g, ' ')
      .replace(/[^\S\n]+/g, ' ')
      .replace(/ *\n */g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

  let previous: string;
  let current = text;
  do {
    previous = current;
    current = sanitizeOnce(previous);
  } while (current !== previous);

  return current;
}

/**
 * A post has no title (social-media model). This is the human-readable label
 * derived from the body: markdown stripped, whitespace collapsed, ellipsised.
 * Falls back to `fallback` (e.g. meta_desc) when the body is empty.
 */
export function postExcerpt(content: string | null, fallback = '', max = 160): string {
  const text = content ? stripMarkdown(content) : '';
  const source = (text || fallback).replace(/\s+/g, ' ').trim();
  if (source.length <= max) return source;
  return `${source.slice(0, max - 1).trimEnd()}…`;
}

export function estimateWordCount(content: string | null): number {
  if (!content) return 0;
  const text = stripMarkdown(content);
  if (!text) return 0;
  return text.split(/\s+/).filter(Boolean).length;
}

export function estimateReadingTime(content: string | null): number {
  return Math.ceil(estimateWordCount(content) / 180);
}
