import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  CATEGORIES,
  REGIONS,
  canonicalUrl,
  normalizeTitle,
  parseFeed,
  titleSimilarity,
  toIsoDate,
} from '../news/lib.mjs';
import { extractJson, validateDigest } from '../news/validate-digest.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

const RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <channel>
    <item>
      <title>معمل أسمنت حماة يستعد للتشغيل</title>
      <link>https://www.enabbaladi.net/830217/story?utm_source=rss&amp;at_medium=RSS</link>
      <pubDate>Fri, 23 Oct 2026 05:55:27 +0000</pubDate>
      <description><![CDATA[<p>خطة لرفع الإنتاج في <b>المعمل</b>.</p>]]></description>
    </item>
    <item>
      <title>خبر بلا رابط</title>
      <description>نص</description>
    </item>
  </channel>
</rss>`;

const ATOM = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <title>Phone Is About to Stop Being Yours</title>
    <link rel="alternate" href="https://keepandroidopen.org/"/>
    <published>2026-10-23T04:00:00Z</published>
    <summary>An update deadline.</summary>
  </entry>
</feed>`;

function candidates(count = 10) {
  return {
    items: Array.from({ length: count }, (_, index) => ({
      id: `source-${index + 1}:1`,
      url: `https://example.com/story-${index + 1}`,
      sourceId: `source-${index + 1}`,
      sourceName: `Source ${index + 1}`,
      publishedAt: '2026-10-23T04:00:00.000Z',
    })),
  };
}

const TOPICS = [
  'افتتاح معمل للإسمنت',
  'اتفاق تجاري إقليمي',
  'تصعيد عسكري على الحدود',
  'قرار وزاري جديد',
  'اكتشاف علمي في الفضاء',
  'هجوم إلكتروني واسع',
  'مؤتمر دولي للسلام',
  'إطلاق قمر صناعي',
  'تحرك في أسعار النفط',
  'تعديل دستوري مقترح',
];

function stories(count = 8) {
  return Array.from({ length: count }, (_, index) => ({
    url: `https://example.com/story-${index + 1}`,
    headline: `${TOPICS[index] ?? 'خبر متابعة'} في تغطية اليوم`,
    summary: 'ملخص قصير للخبر يشرح ما حدث ومن يتأثر به دون تفاصيل زائدة عن الحاجة.',
    why_it_matters: null,
    category: 'politics',
    region: 'arab',
  }));
}

describe('news digest contract parity', () => {
  it('mirrors the category and region lists in shared/contracts/news.ts', () => {
    const contract = readFileSync(resolve(ROOT, 'shared', 'contracts', 'news.ts'), 'utf8');

    const categories = /NEWS_CATEGORIES = \[([\s\S]*?)\] as const/.exec(contract);
    const regions = /NEWS_REGIONS = \[([\s\S]*?)\] as const/.exec(contract);

    const listed = (block) => [...block.matchAll(/'([a-z]+)'/g)].map((match) => match[1]);

    expect(listed(categories[1])).toEqual(CATEGORIES);
    expect(listed(regions[1])).toEqual(REGIONS);
  });
});

describe('feed parsing', () => {
  it('reads RSS items, unwraps CDATA and strips campaign parameters', () => {
    const [item] = parseFeed(RSS);

    expect(item.title).toBe('معمل أسمنت حماة يستعد للتشغيل');
    expect(item.url).toBe('https://www.enabbaladi.net/830217/story');
    expect(item.publishedAt).toBe('2026-10-23T05:55:27.000Z');
    expect(item.excerpt).toContain('خطة لرفع الإنتاج');
  });

  it('skips an item with no link rather than publishing an empty URL', () => {
    expect(parseFeed(RSS)).toHaveLength(1);
  });

  it('reads Atom entries and their self-closing alternate link', () => {
    const [entry] = parseFeed(ATOM);

    expect(entry.title).toBe('Phone Is About to Stop Being Yours');
    expect(entry.url).toBe('https://keepandroidopen.org/');
    expect(entry.publishedAt).toBe('2026-10-23T04:00:00.000Z');
  });

  it('returns nothing for HTML, an empty body or a truncated document', () => {
    expect(parseFeed('<!doctype html><html><body>Blocked</body></html>')).toEqual([]);
    expect(parseFeed('')).toEqual([]);
    expect(parseFeed('<rss><channel><item><title>half')).toEqual([]);
  });
});

describe('URLs and titles', () => {
  it('removes tracking parameters but keeps meaningful ones', () => {
    expect(canonicalUrl('https://Example.com/a/?utm_source=x&at_medium=RSS&id=7#top')).toBe(
      'https://example.com/a?id=7'
    );
  });

  it('refuses a non-http URL', () => {
    expect(canonicalUrl('javascript:alert(1)')).toBeNull();
  });

  it('treats the same story with and without diacritics as a duplicate', () => {
    expect(titleSimilarity('مَعمل أسمنت حماة يستعد', 'معمل أسمنت حماة يستعد')).toBe(1);
    expect(normalizeTitle('معمل أسمنت حماة!')).toBe('معمل أسمنت حماة');
  });

  it('keeps a feed date only when it is plausible', () => {
    expect(toIsoDate('Fri, 23 Oct 2026 05:55:27 +0000')).toBe('2026-10-23T05:55:27.000Z');
    expect(toIsoDate('1970-01-01T00:00:00Z')).toBeNull();
    expect(toIsoDate('not a date')).toBeNull();
  });
});

describe('model output extraction', () => {
  it('finds the object inside fenced output with prose around it', () => {
    const raw = 'Here is the digest:\n```json\n{"title":"x","stories":[]}\n```\nDone.';
    expect(extractJson(raw)).toEqual({ title: 'x', stories: [] });
  });

  it('ignores braces inside strings', () => {
    expect(extractJson('{"lede":"a { brace } inside","stories":[]}')).toEqual({
      lede: 'a { brace } inside',
      stories: [],
    });
  });

  it('throws when there is no object', () => {
    expect(() => extractJson('لا يوجد شيء')).toThrow();
  });
});

describe('digest validation', () => {
  const date = '2026-10-23';

  it('accepts a well-formed digest and resolves the source of each story', () => {
    const result = validateDigest({
      digest: {
        digest_date: date,
        title: 'ملخص أخبار اليوم',
        lede: 'أهم ما حدث اليوم.',
        stories: stories(),
      },
      candidates: candidates(),
      date,
      model: 'opencode-go/deepseek-v4.1-flash#high',
    });

    expect(result.problems).toEqual([]);
    expect(result.digest.story_count).toBe(8);
    expect(result.digest.stories[0]).toMatchObject({
      position: 1,
      source_id: 'source-1',
      source_name: 'Source 1',
      source_url: 'https://example.com/story-1',
    });
  });

  it('resolves a story from its candidate_id, ignoring a retyped URL', () => {
    const list = stories(8).map((story, index) => ({
      candidate_id: `source-${index + 1}:1`,
      headline: story.headline,
      summary: story.summary,
      why_it_matters: null,
      category: 'politics',
      region: 'arab',
    }));

    const result = validateDigest({
      digest: {
        digest_date: date,
        title: 'ملخص أخبار اليوم',
        lede: 'أهم ما حدث اليوم.',
        stories: list,
      },
      candidates: candidates(),
      date,
    });

    expect(result.problems).toEqual([]);
    expect(result.digest.stories[0].source_url).toBe('https://example.com/story-1');
  });

  it('rejects a candidate_id the list does not contain', () => {
    const list = stories(8).map((story, index) => ({
      candidate_id: index === 0 ? 'invented:9' : `source-${index + 1}:1`,
      headline: story.headline,
      summary: story.summary,
      why_it_matters: null,
      category: 'politics',
      region: 'arab',
    }));

    const result = validateDigest({
      digest: {
        digest_date: date,
        title: 'ملخص أخبار اليوم',
        lede: 'أهم ما حدث اليوم.',
        stories: list,
      },
      candidates: candidates(),
      date,
    });

    expect(result.digest).toBeNull();
    expect(result.problems.join('\n')).toContain('candidate_id is not one of the candidates');
  });

  it('rejects a URL that was not in the candidate list', () => {
    const list = stories();
    list[0].url = 'https://invented.example.com/story';
    const result = validateDigest({
      digest: {
        digest_date: date,
        title: 'ملخص أخبار اليوم',
        lede: 'أهم ما حدث اليوم.',
        stories: list,
      },
      candidates: candidates(),
      date,
    });

    expect(result.digest).toBeNull();
    expect(result.problems.join('\n')).toContain('not one of the candidates');
  });

  it('rejects Arabic-Indic digits, the tanween spelling and the wrong day', () => {
    const list = stories();
    // Escaped on purpose: the fixtures are the only place these characters may
    // appear, and the repo's digit/arabic gates scan source text.
    list[1].summary = 'قال \u0663 أشخاص إن الأمر \u062C\u0627\u0631\u064B';
    const result = validateDigest({
      digest: {
        digest_date: '2026-10-22',
        title: 'ملخص أخبار اليوم',
        lede: 'أهم ما حدث اليوم.',
        stories: list,
      },
      candidates: candidates(),
      date,
    });

    const problems = result.problems.join('\n');
    expect(problems).toContain('digest_date');
    expect(problems).toContain('non-ASCII digits');
    expect(problems).toContain('tanween spelling');
  });

  it('rejects a digest that is too short or repeats a URL', () => {
    const list = stories(4);
    list[1].url = list[0].url;
    const result = validateDigest({
      digest: {
        digest_date: date,
        title: 'ملخص أخبار اليوم',
        lede: 'أهم ما حدث اليوم.',
        stories: list,
      },
      candidates: candidates(),
      date,
    });

    expect(result.problems.join('\n')).toContain('must be 8-12');
    expect(result.problems.join('\n')).toContain('duplicate story');
  });
});
