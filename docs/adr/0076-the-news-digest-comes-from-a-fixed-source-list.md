# The news digest is generated from a fixed source list, and validated before it publishes

`/news` publishes one Arabic digest a day. The choice that shapes everything else is that a model may
**select and write** but may never **find**: the trusted sources are a versioned file in the repo
(`data/news/sources.json`), a script fetches them into a candidate list, and the model only sees that
list. It returns each chosen story by the candidate's short `id`, not by URL — a retyped URL is where a
transcription error hides, and one live run produced an Arabic number sign where the slug held a
tatweel. `scripts/news/validate-digest.mjs` resolves the id back to the fetched candidate and is what
gates the write.

The tempting alternative — let the agent browse and summarise what it finds — makes "trusted sources"
a property of a prompt. A prompt is not reviewable, not diffable, and not enforceable once the model
has an opinion about which site counts; a model that hallucinates a URL, a death toll, or a "source"
the list never contained would publish it. Here, the fetch is deterministic and the only writing the
model does is Arabic prose about items that provably exist.

## How a day is produced

1. `fetch-candidates.mjs` reads `data/news/sources.json` (RSS/Atom, category and region defaults per
   feed, tier 1 = first priority), drops items older than 48 hours, drops URLs published in the last
   four days, and deduplicates by canonical URL and by title overlap.
2. `build-prompt.mjs` renders the candidate list into an editor prompt with the day's priorities:
   religion, politics and tech before the rest, the Arab and Islamic world before the wider world.
3. `opencode run --model opencode-go/deepseek-v4.1-flash#high` writes the digest as JSON.
4. `validate-digest.mjs` re-checks every field: 8-12 stories, each `candidate_id` resolving to a
   fetched story, ASCII digits, NFC Arabic, the repo's «جاري» spelling, at least 60% Arabic copy, no
   story used twice. Priority misses are annotations, not failures.
5. `publish-digest.mjs` writes through PostgREST with the service role — digest first with
   `story_count = 0`, then stories, then the count — so a failure never leaves a digest claiming
   stories it does not have.

A run that fails at any step publishes nothing. A missed digest is recoverable (re-run with
`date`); a fabricated one is not.

## Why the web app only reads

The write path lives in the workflow, not in a route handler. It needs no serverless time limit, and
it keeps the app's database credentials out of the publish path entirely: the digest tables are
publicly readable and service-role-writable, and nothing in the Next.js process can rewrite a day's
news. The page is therefore a read plus a Realtime subscription on `news_digests` (published in
`20261023130100`), which refreshes the server component when a new digest lands.

## Retention

Thirty days, then deleted by a pg_cron sweep (`20261023130200`). A month-old digest is not archive
material, and third-party summaries should not be kept past the point they serve. Search therefore
covers the retained month by construction, using a trigram index because Postgres has no Arabic
text-search configuration.

## Video sources (2026-10-23)

Six YouTube channels join the list as ordinary Atom feeds (`youtube.com/feeds/videos.xml?channel_id=…`,
no API key and no quota), so nothing downstream knows a candidate is a video: the feed parser reads
`media:description` for the item text, and the validator resolves the `watch?v=` URL like any other.
Four are Arabic news channels the site already follows; two are religion channels, which publish a few
times a week and therefore carry the same `freshHours: 168` as the scholarly feeds.

What a channel feed cannot give is the transcript. `captions.download` is owner-only, and scraping
`timedtext` from a datacenter IP is both unreliable and against YouTube's terms, so a video is
summarised from its title and description. That is accurate for the newsroom clips that dominate these
channels; an analysis segment would be summarised from its blurb alone, which is why the prompt tells
the model to never imply it watched the footage.

The same change closed two gaps the prompt could not enforce. A field now needs 60% of its prose to be
Arabic — capitalised names excluded — and no run of four Latin words: fifteen of the twenty-five feeds
are English, so translation is the normal path, and "contains one Arabic letter" was not a check. And
the editorial priorities (religion, politics, tech; Arab and Islamic world first) now emit
`::warning::` annotations when the model ignores them instead of failing the run: a quiet religion day
must not cost the whole digest.

## Considered options

- **Let the model fetch and browse, with the source list in the prompt.** Rejected: unenforceable —
  the first invented URL looks exactly like a real one.
- **One `jsonb` column per day instead of two tables.** Rejected: the page filters by category and
  searches text, and both are SQL over columns; a blob would move that work into JS and lose the
  index.
- **Publish through an app route with an admin approval step.** Rejected for now: the owner chose
  auto-publish, and the validator is the gate that makes that defensible. An approval queue can be
  added later without changing the schema.
- **Keep the digests forever.** Rejected: stale days rank in search, and republished third-party text
  does not need to outlive its month.
