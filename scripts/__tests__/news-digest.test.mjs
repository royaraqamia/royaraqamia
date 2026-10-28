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
  readSources,
  stripHtml,
  titleSimilarity,
  toApprovedSource,
  toIsoDate,
} from '../news/lib.mjs';
import { arabicShare, extractJson, validateDigest } from '../news/validate-digest.mjs';
import { narrowCandidates, preparePersonalDigests } from '../news/personal-digests.mjs';
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
      category: 'tech',
      region: 'world',
      tier: 1,
      freshHours: 72,
    });

    expect(toApprovedSource({ ...base[0], category: 'sport' })).toBeNull();
    expect(toApprovedSource({ ...base[0], url: 'javascript:alert(1)' })).toBeNull();
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
    const manifest = await preparePersonalDigests({
      readers: [
        { userId: 'u-empty', sourceIds: [] },
        { userId: 'u-thin', sourceIds: ['b'] },
        { userId: 'u-ok', sourceIds: ['a'] },
      ],
      candidates: candidateSet,
      out,
      log: () => {},
    });

    expect(manifest.users.map((user) => user.userId)).toEqual(['u-ok']);
    expect(manifest.skipped.map((skip) => skip.userId)).toEqual(['u-empty', 'u-thin']);
    expect(await readFile(join(out, 'u-ok', 'prompt.txt'), 'utf8')).toContain('personal');
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

  it('charges once, with a deterministic client event id, and writes the digest', async () => {
    const calls = stubFetch((url) => {
      if (url.includes('/rpc/spend_credits_once')) {
        return json({ allowed: true, eventId: 'event-1', remaining: 10 });
      }
      if (url.includes('/news_user_digests?on_conflict')) return json([{ id: 'digest-1' }]);
      return json(null);
    });

    const result = await publish();

    expect(result).toEqual({ id: 'digest-1', published: true, dryRun: false });

    const spends = calls.filter((call) => call.url.endsWith('/rpc/spend_credits_once'));
    expect(spends).toHaveLength(1);
    expect(spends[0].body).toMatchObject({
      p_user_id: userId,
      p_action_key: 'news.digest.generate',
    });
    expect(spends[0].body.p_client_event_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(calls.some((call) => call.url.includes('/rpc/refund_credits'))).toBe(false);
  });

  it('makes no second charge for the same reader and day', async () => {
    const spent = new Set();
    let charges = 0;
    const calls = stubFetch((url, init) => {
      if (url.includes('/rpc/spend_credits_once')) {
        const eventId = JSON.parse(init.body).p_client_event_id;
        if (spent.has(eventId)) {
          return json({ allowed: true, eventId: null, remaining: 10 });
        }
        spent.add(eventId);
        charges += 1;
        return json({ allowed: true, eventId: 'event-1', remaining: 10 });
      }
      if (url.includes('/news_user_digests?on_conflict')) return json([{ id: 'digest-1' }]);
      return json(null);
    });

    await publish();
    await publish();

    const eventIds = calls
      .filter((call) => call.url.endsWith('/rpc/spend_credits_once'))
      .map((call) => call.body.p_client_event_id);

    expect(eventIds).toHaveLength(2);
    expect(new Set(eventIds).size).toBe(1);
    expect(charges).toBe(1);
  });

  it('refunds exactly once when a write fails after a successful spend', async () => {
    const calls = stubFetch((url) => {
      if (url.includes('/rpc/spend_credits_once')) {
        return json({ allowed: true, eventId: 'event-1', remaining: 10 });
      }
      if (url.includes('/rpc/refund_credits')) return json(true);
      if (url.includes('/news_user_digests?on_conflict')) return json({ message: 'boom' }, 500);
      return json(null);
    });

    await expect(publish()).rejects.toThrow('HTTP 500');

    const refunds = calls.filter((call) => call.url.endsWith('/rpc/refund_credits'));
    expect(refunds).toHaveLength(1);
    expect(refunds[0].body).toEqual({ p_user_id: userId, p_event_id: 'event-1' });
  });

  it('logs a refund failure without masking the publish error', async () => {
    const messages = [];
    stubFetch((url) => {
      if (url.includes('/rpc/spend_credits_once')) {
        return json({ allowed: true, eventId: 'event-1', remaining: 10 });
      }
      if (url.includes('/rpc/refund_credits')) return json({ message: 'down' }, 503);
      if (url.includes('/news_user_digests?on_conflict')) return json({ message: 'boom' }, 500);
      return json(null);
    });

    await expect(publish(userId, (message) => messages.push(message))).rejects.toThrow('HTTP 500');

    expect(messages.join('\n')).toContain('Refund failed');
    expect(messages.join('\n')).toContain('event-1');
  });

  it('writes nothing and refunds nothing when the allowance is exhausted', async () => {
    const messages = [];
    const calls = stubFetch(() => json({ allowed: false, remaining: 0 }));

    const result = await publish(userId, (message) => messages.push(message));

    expect(result).toEqual({ id: null, published: false, dryRun: false });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain('/rpc/spend_credits_once');
    expect(calls.some((call) => call.url.includes('/rpc/refund_credits'))).toBe(false);
    expect(messages.join('\n')).toContain('Skipped');
  });
});
