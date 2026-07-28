function stripMarkdown(text: string): string {
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

export function estimateWordCount(content: string | null): number {
  if (!content) return 0;
  const text = stripMarkdown(content);
  if (!text) return 0;
  return text.split(/\s+/).filter(Boolean).length;
}

export function estimateReadingTime(content: string | null): number {
  return Math.ceil(estimateWordCount(content) / 180);
}

export function formatReadingTime(minutes: number): string {
  if (minutes < 1) return 'أقل من دقيقة';
  return `${minutes} د`;
}

export function formatReadingTimeLong(minutes: number): string {
  if (minutes < 1) return 'أقل من دقيقة';
  if (minutes === 1) return 'دقيقة واحدة';
  if (minutes === 2) return 'دقيقتان';
  return `${minutes} دقائق قراءة`;
}
