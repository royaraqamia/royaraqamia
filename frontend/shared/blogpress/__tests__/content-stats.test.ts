import { describe, expect, it } from 'vitest';
import { estimateContentStats } from '../content-stats';

describe('estimateContentStats', () => {
  it('returns zeros for empty content', () => {
    const stats = estimateContentStats(null);
    expect(stats.words).toBe(0);
    expect(stats.characters).toBe(0);
    expect(stats.headingCount).toBe(0);
    expect(stats.paragraphs).toBe(0);
    expect(stats.images).toBe(0);
    expect(stats.links).toBe(0);
    expect(stats.readability.label).toBe('تحتاج إلى تحسين');
  });

  it('counts words, reading time and sentences', () => {
    const stats = estimateContentStats('عنوان اثنان ثلاثة. أربعة خمسة.');
    expect(stats.words).toBe(5);
    expect(stats.characters).toBeGreaterThan(0);
    expect(stats.readingTimeMinutes).toBe(1);
    expect(stats.sentences).toBe(2);
  });

  it('counts heading levels per level and the total', () => {
    const stats = estimateContentStats('# واحد\n## اثنان\n### ثلاثة\n#### أربعة\n### خمسة');
    expect(stats.headings.h1).toBe(1);
    expect(stats.headings.h2).toBe(1);
    expect(stats.headings.h3).toBe(2);
    expect(stats.headingCount).toBe(5);
  });

  it('detects images and flags those without alt text', () => {
    const stats = estimateContentStats(
      'نص قبل\n\n![وصف الصورة](https://x.test/a.png)\n\n![](https://x.test/b.png)\n\n![](https://x.test/c.png)'
    );
    expect(stats.images).toBe(3);
    expect(stats.imagesMissingAlt).toBe(2);
  });

  it('counts links while ignoring image embeds', () => {
    const stats = estimateContentStats('[رابط](https://x.test) و ![](https://x.test/i.png)');
    expect(stats.links).toBe(1);
    expect(stats.images).toBe(1);
  });

  it('counts paragraphs excluding headings, lists and code fences', () => {
    const stats = estimateContentStats(
      '# عنوان\n\nفقرة أولى واحدة.\n\n- بند أ\n- بند ب\n\n```\nكود\n```\n\nفقرة أخيرة.'
    );
    expect(stats.paragraphs).toBe(2);
    expect(stats.codeBlocks).toBe(1);
  });

  it('assigns a strong readability label for short, simple sentences', () => {
    const stats = estimateContentStats('هذا نص قصير. كلمات بسيطة.');
    expect(stats.readability.score).toBeGreaterThanOrEqual(80);
    expect(stats.readability.label).toBe('ممتازة');
  });

  it('assigns a weak readability label for very long sentences', () => {
    const longSentence =
      'هذه جملة طويلة جداً تحتوي على عدد كبير جداً من الكلمات التي تجعل قراءة الفقرة بأكملها أمراً مرهقاً على القارئ بسبب طولها الكبير وغير الطبيعي؛ عباراتها متشابكة.';
    const stats = estimateContentStats(longSentence);
    expect(stats.readability.score).toBeLessThan(55);
    expect(stats.readability.label).toBe('تحتاج إلى تحسين');
  });
});
