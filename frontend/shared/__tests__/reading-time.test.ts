import { describe, it, expect } from 'vitest';
import {
  estimateWordCount,
  estimateReadingTime,
  formatReadingTime,
  formatReadingTimeLong,
} from '@/frontend/shared/reading-time';

describe('estimateWordCount', () => {
  it('returns 0 for null/empty content', () => {
    expect(estimateWordCount(null)).toBe(0);
    expect(estimateWordCount('')).toBe(0);
    expect(estimateWordCount('   ')).toBe(0);
  });

  it('counts plain words', () => {
    expect(estimateWordCount('one two three')).toBe(3);
  });

  it('strips markdown links entirely, including their text', () => {
    expect(estimateWordCount('[click here](https://example.com)')).toBe(0);
  });

  it('strips inline code and code blocks', () => {
    expect(estimateWordCount('word `inline code` word')).toBe(2);
    expect(estimateWordCount('before ```js\nconst a = 1;\n``` after')).toBe(2);
  });

  it('strips images', () => {
    expect(estimateWordCount('![alt text](image.png)')).toBe(0);
  });

  it('removes heading markers, bold, italics, strikethrough, blockquotes and lists, keeping their text', () => {
    expect(estimateWordCount('# Heading')).toBe(1);
    expect(estimateWordCount('## Sub heading')).toBe(2);
    expect(estimateWordCount('**bold** text')).toBe(2);
    expect(estimateWordCount('*italic* text')).toBe(2);
    expect(estimateWordCount('~~gone~~ text')).toBe(2);
    expect(estimateWordCount('> quoted text')).toBe(2);
    expect(estimateWordCount('- item one')).toBe(2);
    expect(estimateWordCount('1. numbered item')).toBe(2);
    expect(estimateWordCount('---')).toBe(0);
  });

  it('collapses repeated whitespace before counting', () => {
    expect(estimateWordCount('many    spaces   here')).toBe(3);
  });
});

describe('estimateReadingTime', () => {
  it('returns 0 for empty content', () => {
    expect(estimateReadingTime(null)).toBe(0);
    expect(estimateReadingTime('')).toBe(0);
  });

  it('returns 1 minute for content under the 180-word threshold', () => {
    expect(estimateReadingTime('a '.repeat(180))).toBe(1);
  });

  it('rounds up to the nearest minute at boundary', () => {
    expect(estimateReadingTime('a '.repeat(181))).toBe(2);
    expect(estimateReadingTime('a '.repeat(360))).toBe(2);
    expect(estimateReadingTime('a '.repeat(361))).toBe(3);
  });
});

describe('formatReadingTime', () => {
  it('returns "أقل من دقيقة" for less than a minute', () => {
    expect(formatReadingTime(0)).toBe('أقل من دقيقة');
    expect(formatReadingTime(0.5)).toBe('أقل من دقيقة');
  });

  it('returns the minute count for one or more minutes', () => {
    expect(formatReadingTime(1)).toBe('1 د');
    expect(formatReadingTime(5)).toBe('5 د');
    expect(formatReadingTime(120)).toBe('120 د');
  });
});

describe('formatReadingTimeLong', () => {
  it('returns "أقل من دقيقة" for less than a minute', () => {
    expect(formatReadingTimeLong(0)).toBe('أقل من دقيقة');
  });

  it('returns the singular form for one minute', () => {
    expect(formatReadingTimeLong(1)).toBe('دقيقة واحدة');
  });

  it('returns the dual form for two minutes', () => {
    expect(formatReadingTimeLong(2)).toBe('دقيقتان');
  });

  it('returns the plural form for three or more minutes', () => {
    expect(formatReadingTimeLong(3)).toBe('3 دقائق قراءة');
    expect(formatReadingTimeLong(10)).toBe('10 دقائق قراءة');
  });
});
