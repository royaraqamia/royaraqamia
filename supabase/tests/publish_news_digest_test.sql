-- Publishing a News Digest is one transaction (#602).
-- Run with `supabase test db` against the local stack - see README.md.
--
-- `publish_news_digest` replaced four PostgREST requests that could not share a
-- transaction. The assertion that matters is the one an ordering cannot make: a
-- run that fails *after* its delete must leave the previous digest, its stories
-- and its `story_count` exactly as they were.
--
-- The bad story is refused by `news_stories.category`'s check, which is the shape
-- a real failure takes: a model output the validator missed, or a schema the
-- digest still assumes. It fails on the second story, so the first one is already
-- inserted when the exception is raised - the delete and a partial insert both
-- have to roll back, not only the statement that failed.
--
-- Fixtures are written by the function itself and the whole file rolls back.

begin;

create extension if not exists pgtap;

select plan(16);

-- ---------------------------------------------------------------------------
-- Fixtures: a published day, written through the function
-- ---------------------------------------------------------------------------

select is(
  (
    select story_count
      from public.publish_news_digest(
        jsonb_build_object(
          'digest_date', '2026-10-23',
          'title', 'ملخص أخبار الثالث والعشرين',
          'lede', 'أهم ما حدث في سوريا والعالم اليوم.',
          'model', 'opencode-go/deepseek-v4.1-flash',
          'run_url', 'https://github.com/royaraqamia/royaraqamia/actions/runs/1'
        ),
        jsonb_build_array(
          jsonb_build_object(
            'position', 1, 'category', 'politics', 'region', 'arab',
            'headline_ar', 'خبر أول', 'summary_ar', 'ملخص الخبر الأول.',
            'why_it_matters_ar', null, 'source_id', 'source-a',
            'source_name', 'المصدر أ', 'source_url', 'https://example.com/a',
            'source_published_at', '2026-10-23T04:00:00.000Z'
          ),
          jsonb_build_object(
            'position', 2, 'category', 'tech', 'region', 'world',
            'headline_ar', 'خبر ثان', 'summary_ar', 'ملخص الخبر الثاني.',
            'why_it_matters_ar', 'لماذا يهم.', 'source_id', 'source-b',
            'source_name', 'المصدر ب', 'source_url', 'https://example.com/b',
            'source_published_at', '2026-10-23T05:00:00.000Z'
          )
        )
      )
  ),
  2,
  'a fresh day publishes the stories it was given'
);

select is(
  (select story_count from public.news_digests where digest_date = date '2026-10-23'),
  2,
  'the digest row carries the count the function inserted'
);

select results_eq(
  $$select s.headline_ar
      from public.news_stories s
      join public.news_digests d on d.id = s.digest_id
     where d.digest_date = date '2026-10-23'
     order by s.position$$,
  $$values ('خبر أول'::text), ('خبر ثان'::text)$$,
  'the stories are stored against that digest, in order'
);

select set_config(
  'test.digest',
  (select id::text from public.news_digests where digest_date = date '2026-10-23'),
  true
);

-- ---------------------------------------------------------------------------
-- A failing insert rolls the delete and the upsert back
-- ---------------------------------------------------------------------------

select throws_ok(
  $$select * from public.publish_news_digest(
      jsonb_build_object(
        'digest_date', '2026-10-23',
        'title', 'ملخص بديل',
        'lede', 'نص بديل.',
        'model', 'opencode-go/deepseek-v4.1-flash',
        'run_url', null
      ),
      jsonb_build_array(
        jsonb_build_object(
          'position', 1, 'category', 'tech', 'region', 'world',
          'headline_ar', 'خبر بديل', 'summary_ar', 'ملخص بديل.',
          'why_it_matters_ar', null, 'source_id', 'source-c',
          'source_name', 'المصدر ج', 'source_url', 'https://example.com/c',
          'source_published_at', null
        ),
        jsonb_build_object(
          'position', 2, 'category', 'sport', 'region', 'world',
          'headline_ar', 'خبر مرفوض', 'summary_ar', 'تصنيف غير مسموح.',
          'why_it_matters_ar', null, 'source_id', 'source-d',
          'source_name', 'المصدر د', 'source_url', 'https://example.com/d',
          'source_published_at', null
        )
      )
    )$$,
  '23514',
  null,
  'a story the table refuses aborts the whole write'
);

select is(
  (select title from public.news_digests where digest_date = date '2026-10-23'),
  'ملخص أخبار الثالث والعشرين',
  'the failed run rolls the digest upsert back too'
);

select is(
  (select story_count from public.news_digests where digest_date = date '2026-10-23'),
  2,
  'the failed run leaves the previous story_count in place'
);

select results_eq(
  $$select s.headline_ar
      from public.news_stories s
      join public.news_digests d on d.id = s.digest_id
     where d.digest_date = date '2026-10-23'
     order by s.position$$,
  $$values ('خبر أول'::text), ('خبر ثان'::text)$$,
  'the failed run leaves the stories it had already deleted'
);

-- ---------------------------------------------------------------------------
-- A successful re-run replaces the day in place
-- ---------------------------------------------------------------------------

select is(
  (
    select story_count
      from public.publish_news_digest(
        jsonb_build_object(
          'digest_date', '2026-10-23',
          'title', 'ملخص أخبار الثالث والعشرين، طبعة ثانية',
          'lede', 'نص محدَّث.',
          'model', 'opencode-go/deepseek-v4.1-flash',
          'run_url', null
        ),
        jsonb_build_array(
          jsonb_build_object(
            'position', 1, 'category', 'economy', 'region', 'arab',
            'headline_ar', 'خبر ثالث', 'summary_ar', 'ملخص الخبر الثالث.',
            'why_it_matters_ar', null, 'source_id', 'source-e',
            'source_name', 'المصدر هـ', 'source_url', 'https://example.com/e',
            'source_published_at', null
          )
        )
      )
  ),
  1,
  'a re-run reports the stories it inserted'
);

select is(
  (select id::text from public.news_digests where digest_date = date '2026-10-23'),
  current_setting('test.digest'),
  'a re-run keeps the day''s digest row, and its id'
);

select results_eq(
  $$select s.headline_ar
      from public.news_stories s
      join public.news_digests d on d.id = s.digest_id
     where d.digest_date = date '2026-10-23'
     order by s.position$$,
  $$values ('خبر ثالث'::text)$$,
  'a re-run replaces the day''s stories rather than appending to them'
);

select is(
  (select story_count from public.news_digests where digest_date = date '2026-10-23'),
  1,
  'a re-run sets story_count to the number it stored'
);

-- ---------------------------------------------------------------------------
-- Only the publishing workflow may call it
-- ---------------------------------------------------------------------------

reset role;

select ok(
  not has_function_privilege(
    'anon', 'public.publish_news_digest(jsonb, jsonb)', 'execute'),
  'anon cannot publish a digest'
);

select ok(
  not has_function_privilege(
    'authenticated', 'public.publish_news_digest(jsonb, jsonb)', 'execute'),
  'a signed-in client cannot publish a digest'
);

select ok(
  has_function_privilege(
    'service_role', 'public.publish_news_digest(jsonb, jsonb)', 'execute'),
  'the service role the workflow runs as keeps execute'
);

select ok(
  (select prosecdef
     from pg_proc
    where oid = 'public.publish_news_digest(jsonb, jsonb)'::regprocedure),
  'the function runs as its owner, so the workflow needs no table grants of its own'
);

select ok(
  (select proconfig
     from pg_proc
    where oid = 'public.publish_news_digest(jsonb, jsonb)'::regprocedure) @> array['search_path=public'],
  'the function pins search_path, so no function_search_path_mutable finding'
);

select * from finish();

rollback;
