export interface ContentStats {
  words: number;
  characters: number;
  readingTimeMinutes: number;
  headings: { h1: number; h2: number; h3: number };
  headingCount: number;
  paragraphs: number;
  images: number;
  imagesMissingAlt: number;
  links: number;
  codeBlocks: number;
  sentences: number;
  readability: { score: number; label: 'ممتازة' | 'جيدة' | 'تحتاج إلى تحسين' };
}

const BLANK_LINE = /\n\s*\n/;
const FENCE_LINE = /^\s*```/gm;
const HEADING_LINE = /^\s{0,3}#{1,6}\s+/;
const LIST_ITEM = /^\s{0,3}([-*+]\s+|\d+\.\s+)/;

function stripMarkdown(text: string): string {
  const sanitizeOnce = (value: string): string =>
    value
      .replace(/[<>]/g, ' ')
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/!\[.*?\]\(.*?\)/g, ' ')
      .replace(/\[([^\]]*)\]\(.*?\)/g, '$1')
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
      .replace(/\s{2,}/g, ' ')
      .trim();

  let previous: string;
  let current = text;
  do {
    previous = current;
    current = sanitizeOnce(previous);
  } while (current !== previous);

  return current;
}

function countHeadings(content: string) {
  const h1 = content.match(/^\s{0,3}#\s+.*$/gm)?.length ?? 0;
  const h2 = content.match(/^\s{0,3}##\s+.*$/gm)?.length ?? 0;
  const h3 = content.match(/^\s{0,3}###\s+.*$/gm)?.length ?? 0;
  const others = content.match(/^\s{0,3}#{4,6}\s+.*$/gm)?.length ?? 0;
  return { h1, h2, h3, others };
}

function countSentences(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  const parts = trimmed.split(/[.!?؟۔\n]+/).filter((part) => part.trim().length > 0);
  return Math.max(parts.length, 1);
}

export function estimateContentStats(content: string | null): ContentStats {
  const source = content ?? '';
  const text = stripMarkdown(source);

  const words = text ? text.split(/\s+/).filter(Boolean).length : 0;
  const characters = text.replace(/\s/g, '').length;
  const readingTimeMinutes = Math.max(1, Math.ceil(words / 180));

  const headingCounts = countHeadings(source);
  const headingCount =
    headingCounts.h1 + headingCounts.h2 + headingCounts.h3 + headingCounts.others;

  const blocks = source.split(BLANK_LINE).filter((block) => block.trim().length > 0);
  const paragraphs = blocks.filter((block) => {
    const lines = block.trim().split('\n');
    const allList = lines.every((line) => LIST_ITEM.test(line));
    return !FENCE_LINE.test(block.trim()) && !HEADING_LINE.test(block.trim()) && !allList;
  }).length;

  const imagePattern = /!\[([^\]]*)\]\(([^)\s]*)\)/g;
  const images = source.match(imagePattern) ?? [];
  const imagesMissingAlt = images.filter((match) => {
    const altMatch = /^!\[([^\]]*)\]/.exec(match);
    return !altMatch || altMatch[1]?.trim().length === 0;
  }).length;

  const linkPattern = /\[([^\]]+)\]\(([^)\s]*)\)/g;
  const links = (source.match(linkPattern) ?? []).length;

  const codeBlocks = (source.match(FENCE_LINE) ?? []).length / 2;

  const sentences = countSentences(text);
  const avgWordsPerSentence = sentences > 0 ? words / sentences : 0;
  const rawScore = 100 - avgWordsPerSentence * 8;
  const score = Math.max(0, Math.min(100, Math.round(rawScore)));
  const readability: ContentStats['readability'] =
    words === 0
      ? { score: 0, label: 'تحتاج إلى تحسين' }
      : score >= 80
        ? { score, label: 'ممتازة' }
        : score >= 55
          ? { score, label: 'جيدة' }
          : { score, label: 'تحتاج إلى تحسين' };

  return {
    words,
    characters,
    readingTimeMinutes,
    headings: {
      h1: headingCounts.h1,
      h2: headingCounts.h2,
      h3: headingCounts.h3,
    },
    headingCount,
    paragraphs,
    images: images.length,
    imagesMissingAlt,
    links,
    codeBlocks,
    sentences,
    readability,
  };
}
