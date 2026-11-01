import { readFileSync } from 'node:fs';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it, vi, afterEach } from 'vitest';

import {
  CATEGORIES,
  REGIONS,
  canonicalUrl,
  mergeSources,
  normalizeTitle,
  parseFeed,
  parseTelegramPreview,
  readSources,
  stripHtml,
  titleSimilarity,
  toApprovedSource,
  toIsoDate,
} from '../news/lib.mjs';
import { arabicShare, extractJson, validateDigest } from '../news/validate-digest.mjs';
import {
  loadReaders,
  markServed,
  narrowCandidates,
  preparePersonalDigests,
  readerCandidates,
} from '../news/personal-digests.mjs';
import { collectPrivateCandidates } from '../news/fetch-candidates.mjs';
import { publishDigest } from '../news/publish-digest.mjs';
import { publishPersonalDigest } from '../news/publish-personal-digest.mjs';

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

const YOUTUBE = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns:media="http://search.yahoo.com/mrss/">
  <title>الجزيرة</title>
  <entry>
    <id>yt:video:l1X9hjFMaW0</id>
    <title>وزير الخارجية التركي: اجتماع إسطنبول</title>
    <link rel="alternate" href="https://www.youtube.com/watch?v=l1X9hjFMaW0"/>
    <published>2026-10-23T06:00:00+00:00</published>
    <media:group>
      <media:description>وصف الفيديو الذي يشرح ما دار في الاجتماع.</media:description>
    </media:group>
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

describe('news sources', () => {
  it('reads the video channels through the same loader as the article feeds', () => {
    const sources = readSources(resolve(ROOT, 'data', 'news', 'sources.json'));
    const video = sources.filter((source) =>
      source.url.startsWith('https://www.youtube.com/feeds/videos.xml?')
    );

    expect(video.map((source) => source.id).sort()).toEqual([
      'yt-alaraby',
      'yt-aljazeera-ar',
      'yt-asharq',
      'yt-azhar',
      'yt-elkamali',
      'yt-sky-news-arabia',
    ]);
    for (const source of video) {
      expect(source.url).toMatch(/channel_id=UC[\w-]{22}$/);
    }
    // Religion channels publish a few times a week, like the scholarly feeds.
    for (const source of video.filter((entry) => entry.category === 'religion')) {
      expect(source.freshHours).toBe(168);
    }
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

  it('reads a YouTube channel entry, including its media description', () => {
    const [entry] = parseFeed(YOUTUBE);

    expect(entry.title).toBe('وزير الخارجية التركي: اجتماع إسطنبول');
    expect(entry.url).toBe('https://www.youtube.com/watch?v=l1X9hjFMaW0');
    expect(entry.publishedAt).toBe('2026-10-23T06:00:00.000Z');
    expect(entry.excerpt).toContain('وصف الفيديو');
  });

  it('returns nothing for HTML, an empty body or a truncated document', () => {
    expect(parseFeed('<!doctype html><html><body>Blocked</body></html>')).toEqual([]);
    expect(parseFeed('')).toEqual([]);
    expect(parseFeed('<rss><channel><item><title>half')).toEqual([]);
  });

  it('drops a script or style element even when its end tag has whitespace', () => {
    // CodeQL's `js/bad-tag-filter`: `</script>` alone misses `</script >`, which
    // leaves the script's text behind after the generic tag strip.
    expect(stripHtml('<p>قبل</p><script>alert(1)</script ><p>بعد</p>')).toBe('قبل بعد');
    expect(stripHtml('<script type="x">alert(2)</script foo><p>نص</p>')).toBe('نص');
    expect(stripHtml('<style>.a{}</style ><p>نص</p>')).toBe('نص');
  });
});

describe('reading a Telegram channel preview', () => {
  const PREVIEW = `<!doctype html><html><body>
    <section class="tgme_channel_info"><div class="tgme_channel_info_header_title">قناة</div></section>
    <div class="tgme_widget_message_wrap"><div class="tgme_widget_message" data-post="example/12">
      <div class="tgme_widget_message_text js-message_text">خبرٌ أوّل<br/>تفصيلٌ ثانٍ</div>
      <a class="tgme_widget_message_date" href="https://t.me/example/12">
        <time datetime="2026-10-30T06:00:00+00:00">06:00</time></a>
    </div></div>
    <div class="tgme_widget_message_wrap"><div class="tgme_widget_message" data-post="example/11">
      <div class="tgme_widget_message_photo"></div>
      <a href="https://t.me/example/11"><time datetime="2026-10-29T18:00:00+00:00">18:00</time></a>
    </div></div>
  </body></html>`;

  it('turns each post with text into an item that links to the post', () => {
    const items = parseTelegramPreview(PREVIEW);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      url: 'https://t.me/example/12',
      publishedAt: '2026-10-30T06:00:00.000Z',
    });
    expect(items[0].title).toContain('خبرٌ أوّل');
    expect(items[0].excerpt).toContain('تفصيلٌ ثانٍ');
  });

  it('yields nothing for something that is not a preview', () => {
    expect(parseTelegramPreview('')).toEqual([]);
    expect(parseTelegramPreview('<html><body>Please open Telegram</body></html>')).toEqual([]);
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

  it('rejects a summary that was left in English', () => {
    const list = stories();
    list[0].summary = 'The minister said the meeting was productive and the talks will continue.';
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

    const problems = result.problems.join('\n');
    expect(result.digest).toBeNull();
    expect(problems).toContain('Arabic copy');
    expect(problems).toContain('Latin words in a row');
  });

  it('counts product names as names, not as untranslated prose', () => {
    // A tech headline is allowed to carry names; it is not allowed to be English.
    expect(arabicShare('آبل تطلق Vision Pro في 12 دولة')).toBe(1);
    expect(arabicShare('قرار OpenAI جديد بشأن GPT-5')).toBe(1);
    expect(arabicShare('The minister said the meeting was productive')).toBe(0);
  });

  it('warns, without failing, when the digest ignores the editorial priorities', () => {
    const list = stories(8).map((story) => ({ ...story, category: 'other', region: 'world' }));
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

    const warnings = result.warnings.join('\n');
    expect(result.problems).toEqual([]);
    expect(result.digest.story_count).toBe(8);
    expect(warnings).toContain('lead story is from the rest of the world');
    expect(warnings).toContain('Arab or Islamic world');
    expect(warnings).toContain('religion, politics or tech');
  });

  it('warns about nothing when the priorities are respected', () => {
    const result = validateDigest({
      digest: {
        digest_date: date,
        title: 'ملخص أخبار اليوم',
        lede: 'أهم ما حدث اليوم.',
        stories: stories(),
      },
      candidates: candidates(),
      date,
    });

    expect(result.problems).toEqual([]);
    expect(result.warnings).toEqual([]);
  });
});

describe('approved sources', () => {
  const base = [
    {
      id: 'aljazeera-ar',
      name: 'الجزيرة نت',
      url: 'https://www.aljazeera.net/rss',
      category: 'politics',
      region: 'arab',
      tier: 1,
      freshHours: null,
    },
  ];

  it('appends an approved row after the repo list', () => {
    const approved = {
      id: 'example-com',
      name: 'مثال',
      url: 'https://example.com/rss',
      category: 'world',
      region: 'world',
      tier: 2,
      freshHours: null,
    };

    expect(mergeSources(base, [approved]).map((source) => source.id)).toEqual([
      'aljazeera-ar',
      'example-com',
    ]);
  });

  it('keeps the repo list when an approved row repeats an id or a URL', () => {
    const sameId = { ...base[0], url: 'https://other.example/rss' };
    const sameUrl = { ...base[0], id: 'other-example' };

    expect(mergeSources(base, [sameId, sameUrl])).toEqual(base);
  });

  it('shapes a database row like a file entry, dropping a malformed one', () => {
    expect(
      toApprovedSource({
        id: 'example-com',
        name: 'مثال',
        url: 'https://example.com/rss/',
        category: 'tech',
        region: 'world',
        tier: 1,
        fresh_hours: 72,
      })
    ).toEqual({
      id: 'example-com',
      name: 'مثال',
      url: 'https://example.com/rss',
      kind: 'feed',
      category: 'tech',
      region: 'world',
      tier: 1,
      freshHours: 72,
    });

    expect(toApprovedSource({ ...base[0], category: 'sport' })).toBeNull();
    expect(toApprovedSource({ ...base[0], url: 'javascript:alert(1)' })).toBeNull();
  });
});

describe('private sources', () => {
  const SOURCE = {
    id: 'private-1',
    userId: 'user-1',
    name: 'مدونة',
    url: 'https://example.com/rss',
    kind: 'feed',
    category: 'tech',
    region: 'world',
    tier: 2,
    freshHours: null,
    failureCount: 0,
  };
  const NOW = Date.parse('2026-10-23T12:00:00Z');

  it('fetches a feed two readers hold once, and gives each its own items', async () => {
    const fetchImpl = vi.fn(async () => RSS);

    const { items, health } = await collectPrivateCandidates({
      sources: [SOURCE, { ...SOURCE, id: 'private-2', userId: 'user-2' }],
      fetchImpl,
      now: NOW,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(items.map((item) => item.userId)).toEqual(['user-1', 'user-2']);
    expect(items.map((item) => item.sourceId)).toEqual(['private-1', 'private-2']);
    expect(health).toEqual([
      { id: 'private-1', ok: true, error: null },
      { id: 'private-2', ok: true, error: null },
    ]);
  });

  it('reports a failure against every reader who holds the feed', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('HTTP 403');
    });

    const { items, health } = await collectPrivateCandidates({
      sources: [SOURCE, { ...SOURCE, id: 'private-2', userId: 'user-2' }],
      fetchImpl,
      now: NOW,
    });

    expect(items).toEqual([]);
    expect(health).toEqual([
      { id: 'private-1', ok: false, error: 'HTTP 403' },
      { id: 'private-2', ok: false, error: 'HTTP 403' },
    ]);
  });

  it('reads a Telegram channel through its preview', async () => {
    const fetchImpl = vi.fn(
      async () => `<html><body><div class="tgme_widget_message" data-post="ch/1">
        <div class="tgme_widget_message_text">خبر</div>
        <time datetime="2026-10-23T06:00:00+00:00"></time></div></body></html>`
    );

    const { items } = await collectPrivateCandidates({
      sources: [{ ...SOURCE, kind: 'telegram', url: 'https://t.me/s/ch' }],
      fetchImpl,
      now: NOW,
    });

    expect(items).toHaveLength(1);
    expect(items[0].url).toBe('https://t.me/ch/1');
  });
});

describe('a reader’s candidate list', () => {
  const sharedItems = [
    { id: 'a:1', url: 'https://a.example/1', sourceId: 'a' },
    { id: 'b:1', url: 'https://b.example/1', sourceId: 'b' },
  ];
  const privateItems = [
    { id: 'p:1', url: 'https://p.example/1', sourceId: 'p', userId: 'user-1' },
    // The same story as a catalogue item, republished on a private feed.
    { id: 'p:2', url: 'https://a.example/1', sourceId: 'p', userId: 'user-1' },
  ];

  it('adds only this reader’s private items, after their selection', () => {
    expect(
      readerCandidates({
        shared: sharedItems,
        privateItems,
        userId: 'user-1',
        sourceIds: ['a'],
      }).map((item) => item.id)
    ).toEqual(['a:1', 'p:1']);
  });

  it('never hands another reader’s private items to this one', () => {
    expect(
      readerCandidates({
        shared: sharedItems,
        privateItems,
        userId: 'user-2',
        sourceIds: [],
      }).map((item) => item.id)
    ).toEqual(['a:1', 'b:1']);
  });
});

describe('personal digests', () => {
  const items = [
    { id: 'a:1', title: 'one', sourceId: 'a' },
    { id: 'a:2', title: 'two', sourceId: 'a' },
    { id: 'a:3', title: 'three', sourceId: 'a' },
    { id: 'b:1', title: 'other', sourceId: 'b' },
  ];
  const candidateSet = { digestDate: '2026-10-23', items };

  it('keeps only the candidates from the reader sources', () => {
    expect(narrowCandidates(items, ['a']).map((item) => item.id)).toEqual(['a:1', 'a:2', 'a:3']);
  });

  it('skips a reader with no selection, and one whose sources are too thin', async () => {
    const out = join(await mkdtemp(join(tmpdir(), 'news-personal-')), 'run');
    const served = [];
    const manifest = await preparePersonalDigests({
      readers: [
        { userId: 'u-empty', sourceIds: [] },
        { userId: 'u-thin', sourceIds: ['b'] },
        { userId: 'u-ok', sourceIds: ['a'] },
      ],
      candidates: candidateSet,
      out,
      log: () => {},
      onServed: async (userId) => served.push(userId),
    });

    expect(manifest.users.map((user) => user.userId)).toEqual(['u-ok']);
    expect(manifest.skipped.map((skip) => skip.userId)).toEqual(['u-empty', 'u-thin']);
    expect(await readFile(join(out, 'u-ok', 'prompt.txt'), 'utf8')).toContain('personal');

    // A skip rotates too: leaving a skipped reader at the head would starve
    // everyone behind them, which is the bug this queue exists to fix.
    expect(served).toEqual(['u-empty', 'u-thin', 'u-ok']);
  });

  it('reaches all 25 readers across two runs of 20, never serving one twice', async () => {
    // A stand-in for the PostgREST order (`last_personal_digest_at nulls first,
    // updated_at asc`) — the ordering itself is asserted against the request
    // URL below; this is what it means for a queue.
    const table = Array.from({ length: 25 }, (_, index) => ({
      userId: `u-${index + 1}`,
      sourceIds: ['a'],
      updatedAt: `2026-10-${String(index + 1).padStart(2, '0')}T00:00:00.000Z`,
      servedAt: null,
    }));

    const queued = () =>
      [...table].sort((a, b) => {
        if (a.servedAt === null && b.servedAt !== null) return -1;
        if (a.servedAt !== null && b.servedAt === null) return 1;
        return a.updatedAt.localeCompare(b.updatedAt);
      });

    const served = [];
    const run = async (day) => {
      const out = join(await mkdtemp(join(tmpdir(), 'news-personal-')), 'run');
      await preparePersonalDigests({
        readers: queued()
          .slice(0, 20)
          .map((row) => ({ userId: row.userId, sourceIds: row.sourceIds })),
        candidates: candidateSet,
        out,
        log: () => {},
        onServed: async (userId) => {
          table.find((row) => row.userId === userId).servedAt = `2026-11-${day}T00:00:00.000Z`;
          served.push(userId);
        },
      });
    };

    await run('01');
    await run('02');

    expect(served).toHaveLength(40);
    expect(new Set(served).size).toBe(25);
    // The second run opens with the five nobody had reached, not with the
    // twenty it already served.
    expect(served.slice(20, 25)).toEqual(['u-21', 'u-22', 'u-23', 'u-24', 'u-25']);
  });

  it('accepts a three-story personal digest, which the shared rule rejects', () => {
    const list = stories(3);
    const digest = {
      digest_date: '2026-10-23',
      title: 'ملخص أخبار اليوم',
      lede: 'أهم ما حدث اليوم.',
      stories: list,
    };

    expect(
      validateDigest({ digest, candidates: candidates(), date: '2026-10-23' }).problems
    ).toEqual(expect.arrayContaining([expect.stringContaining('must be 8-12')]));
    expect(
      validateDigest({ digest, candidates: candidates(), date: '2026-10-23', minStories: 3 })
        .problems
    ).toEqual([]);
  });
});

describe('the personal digest queue', () => {
  const config = { url: 'https://project.supabase.co', key: 'service-role' };
  const userId = '11111111-1111-4111-8111-111111111111';

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('asks for never-served readers first, then the oldest served one', async () => {
    const calls = [];
    vi.stubGlobal('fetch', async (url) => {
      calls.push(String(url));
      return { ok: true, json: async () => [] };
    });

    await loadReaders(config, 20);

    expect(calls).toHaveLength(1);
    const [url] = calls;
    expect(url).toContain('select=user_id,source_ids,updated_at,last_personal_digest_at');
    expect(url).toContain('order=last_personal_digest_at.asc.nullsfirst,updated_at.asc');
    expect(url).toContain('limit=20');
    expect(url).toContain('personal_enabled=is.true');
  });

  it('stamps the served marker on the one reader it handled', async () => {
    const calls = [];
    vi.stubGlobal('fetch', async (url, init) => {
      calls.push({ url: String(url), init });
      return { ok: true };
    });

    await markServed(config, userId, new Date('2026-11-01T03:00:00Z'));

    expect(calls).toHaveLength(1);
    expect(calls[0].init.method).toBe('PATCH');
    expect(calls[0].url).toContain(`news_source_preferences?user_id=eq.${userId}`);
    expect(JSON.parse(calls[0].init.body)).toEqual({
      last_personal_digest_at: '2026-11-01T03:00:00.000Z',
    });
  });

  it('reports a refused stamp instead of pretending it was written', async () => {
    vi.stubGlobal('fetch', async () => ({ ok: false, status: 403 }));

    await expect(markServed(config, userId)).rejects.toThrow('HTTP 403');
  });
});

describe('publishing a digest', () => {
  const digest = {
    digest_date: '2026-10-23',
    title: 'ملخص أخبار اليوم',
    lede: 'أهم ما حدث اليوم شرقاً وغرباً.',
    story_count: 8,
    model: 'opencode-go/deepseek-v4.1-flash',
    run_url: 'https://github.com/royaraqamia/royaraqamia/actions/runs/123',
    stories: stories(8).map((story, index) => ({
      position: index + 1,
      category: story.category,
      region: story.region,
      headline_ar: story.headline,
      summary_ar: story.summary,
      why_it_matters_ar: story.why_it_matters,
      source_id: `source-${index + 1}`,
      source_name: `Source ${index + 1}`,
      source_url: story.url,
      source_published_at: '2026-10-23T04:00:00.000Z',
    })),
  };

  const config = { url: 'https://project.supabase.co', key: 'service-role' };

  function json(body, status = 200) {
    return {
      ok: status < 400,
      status,
      text: async () => JSON.stringify(body),
    };
  }

  function stubFetch(handler) {
    const calls = [];
    vi.stubGlobal('fetch', async (url, init) => {
      calls.push({ url, init, body: init.body ? JSON.parse(init.body) : null });
      return handler(url, init, calls.length);
    });
    return calls;
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('publishes nothing on a dry run', async () => {
    const calls = stubFetch(() => json([]));

    const result = await publishDigest({ config, digest, dryRun: true, log: () => {} });

    expect(result).toEqual({ id: null, dryRun: true });
    expect(calls).toHaveLength(0);
  });

  it('writes the digest and its stories in one request, then reads the count back', async () => {
    const calls = stubFetch((url) =>
      url.includes('/rpc/publish_news_digest')
        ? json([{ digest_id: 'digest-1', story_count: 8 }])
        : json(digest.stories.map((_, index) => ({ id: `story-${index + 1}` })))
    );

    const result = await publishDigest({ config, digest, log: () => {} });

    expect(result).toEqual({ id: 'digest-1', dryRun: false });

    // One write, one read-back: no digest upsert, delete or patch of its own.
    expect(calls.map((call) => `${call.init.method} ${call.url}`)).toEqual([
      'POST https://project.supabase.co/rest/v1/rpc/publish_news_digest',
      'GET https://project.supabase.co/rest/v1/news_stories?select=id&digest_id=eq.digest-1',
    ]);

    const [publish] = calls;
    expect(publish.body.p_digest).toEqual(
      expect.objectContaining({
        digest_date: '2026-10-23',
        title: digest.title,
        lede: digest.lede,
        model: digest.model,
        run_url: digest.run_url,
      })
    );
    // `story_count` belongs to the function, which counts what it inserted; the
    // digest id belongs to the insert.
    expect(publish.body.p_digest).not.toHaveProperty('story_count');
    expect(publish.body.p_stories).toHaveLength(8);
    expect(publish.body.p_stories[0]).toEqual(
      expect.objectContaining({ position: 1, source_id: 'source-1' })
    );
    expect(publish.body.p_stories[0]).not.toHaveProperty('digest_id');
  });

  it('fails the run when the function reports fewer stories than were sent', async () => {
    stubFetch(() => json([{ digest_id: 'digest-1', story_count: 7 }]));

    await expect(publishDigest({ config, digest, log: () => {} })).rejects.toThrow(
      'reported 7 stories, expected 8'
    );
  });

  it('fails the run when the stored stories do not match', async () => {
    stubFetch((url) =>
      url.includes('/rpc/publish_news_digest')
        ? json([{ digest_id: 'digest-1', story_count: 8 }])
        : json([{ id: 'story-1' }])
    );

    await expect(publishDigest({ config, digest, log: () => {} })).rejects.toThrow(
      'verification failed: expected 8 stories, found 1'
    );
  });
});

describe('publishing a personal digest', () => {
  const digest = {
    digest_date: '2026-10-23',
    title: 'ملخص أخبار اليوم',
    lede: 'أهم ما حدث اليوم.',
    model: 'opencode-go/deepseek-v4.1-flash',
    run_url: 'https://github.com/royaraqamia/royaraqamia/actions/runs/123',
    stories: stories(3).map((story, index) => ({
      position: index + 1,
      category: story.category,
      region: story.region,
      headline_ar: story.headline,
      summary_ar: story.summary,
      why_it_matters_ar: story.why_it_matters,
      source_id: `source-${index + 1}`,
      source_name: `Source ${index + 1}`,
      source_url: story.url,
      source_published_at: '2026-10-23T04:00:00.000Z',
    })),
  };

  const config = { url: 'https://project.supabase.co', key: 'service-role' };
  const userId = '11111111-1111-4111-8111-111111111111';

  function json(body, status = 200) {
    return {
      ok: status < 400,
      status,
      text: async () => JSON.stringify(body),
    };
  }

  function stubFetch(handler) {
    const calls = [];
    vi.stubGlobal('fetch', async (url, init) => {
      calls.push({ url, init, body: init.body ? JSON.parse(init.body) : null });
      return handler(url, init, calls.length);
    });
    return calls;
  }

  function publish(userIdArg = userId, log = () => {}) {
    return publishPersonalDigest({ config, digest, userId: userIdArg, log });
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('publishes the digest without charging anything', async () => {
    const calls = stubFetch((url) => {
      if (url.includes('/news_user_digests?on_conflict')) return json([{ id: 'digest-1' }]);
      return json(null);
    });

    const result = await publish();

    expect(result).toEqual({ id: 'digest-1', published: true, dryRun: false });
    expect(calls.some((call) => call.url.includes('/rpc/'))).toBe(false);
  });

  it('replaces the day’s digest on a re-run instead of adding one', async () => {
    const calls = stubFetch((url) => {
      if (url.includes('/news_user_digests?on_conflict')) return json([{ id: 'digest-1' }]);
      return json(null);
    });

    await publish();
    await publish();

    const upserts = calls.filter((call) => call.url.includes('/news_user_digests?on_conflict'));
    expect(upserts).toHaveLength(2);
    expect(upserts[0].url).toContain('on_conflict=user_id,digest_date');
  });

  it('throws when the digest write fails, with nothing to undo', async () => {
    const calls = stubFetch((url) => {
      if (url.includes('/news_user_digests?on_conflict')) return json({ message: 'boom' }, 500);
      return json(null);
    });

    await expect(publish()).rejects.toThrow('HTTP 500');

    expect(calls.some((call) => call.url.includes('/rpc/'))).toBe(false);
  });

  it('writes the digest even when the reader’s daily allowance is used up', async () => {
    // Opening is what the plan limits, not generation: the board route counts it
    // and answers an empty board. The nightly run has no allowance to consult.
    const calls = stubFetch((url) => {
      if (url.includes('/news_user_digests?on_conflict')) return json([{ id: 'digest-1' }]);
      return json(null);
    });

    const result = await publish();

    expect(result).toEqual({ id: 'digest-1', published: true, dryRun: false });
    expect(calls.some((call) => call.url.includes('/rpc/'))).toBe(false);
  });
});
