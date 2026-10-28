#!/usr/bin/env node
/**
 * Publishes one reader's personal digest, charging the credit that pays for it.
 *
 *   node scripts/news/publish-personal-digest.mjs --digest .news/personal/<id>/resolved.json --user <uuid>
 *
 * Two decisions worth naming:
 *
 *   * the credit is spent **here**, not when the prompt was prepared: a run whose
 *     model output failed validation publishes nothing and costs nothing;
 *   * a refusal (an exhausted allowance) is not a run failure — the reader keeps
 *     the shared digest, and the workflow carries on with the next reader.
 *
 * The spend is idempotent and refundable: a re-run for the same reader and day
 * reuses a client event id, so it cannot charge twice, and a publish that fails
 * after a successful spend gives the credit back.
 *
 * Writes are ordered like `publish-digest.mjs` so a failure cannot leave a
 * digest claiming stories it does not have.
 */

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { v5 as uuidv5 } from 'uuid';

const ACTION_KEY = 'news.digest.generate';

function digestEventId(userId, digestDate) {
  return uuidv5(`${ACTION_KEY}:${userId}:${digestDate}`, uuidv5.DNS);
}

function parseArgs(argv) {
  const options = { digest: '', user: '', dryRun: false };

  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === '--digest') {
      options.digest = resolve(argv[index + 1] ?? '');
      index += 1;
    } else if (flag === '--user') {
      options.user = String(argv[index + 1] ?? '');
      index += 1;
    } else if (flag === '--dry-run') {
      options.dryRun = true;
    }
  }

  return options;
}

function readConfig(env = process.env) {
  const url = env.SUPABASE_URL ?? env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error('SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) is required');
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required');
  return { url: url.replace(/\/+$/, ''), key };
}

function headers(key, extra = {}) {
  return {
    apikey: key,
    authorization: `Bearer ${key}`,
    'content-type': 'application/json',
    ...extra,
  };
}

async function request(url, key, { method = 'GET', body, prefer } = {}) {
  const response = await fetch(url, {
    method,
    headers: headers(key, prefer ? { prefer } : {}),
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${method} ${url} failed: HTTP ${response.status} ${text.slice(0, 400)}`);
  }

  return text.length > 0 ? JSON.parse(text) : null;
}

export async function publishPersonalDigest({
  config,
  digest,
  userId,
  dryRun = false,
  log = console.log,
}) {
  if (dryRun) {
    log(
      `[dry-run] would charge ${ACTION_KEY} and publish ${digest.story_count} stories for ${userId}`
    );
    return { id: null, published: false, dryRun: true };
  }

  const base = `${config.url}/rest/v1`;

  const spend = await request(`${base}/rpc/spend_credits_once`, config.key, {
    method: 'POST',
    body: {
      p_user_id: userId,
      p_action_key: ACTION_KEY,
      p_client_event_id: digestEventId(userId, digest.digest_date),
    },
  });

  if (!spend?.allowed) {
    log(`Skipped ${userId}: allowance exhausted (remaining ${spend?.remaining ?? 0}).`);
    return { id: null, published: false, dryRun: false };
  }

  const eventId = spend.eventId ?? null;

  const storyRows = digest.stories.map((story) => ({
    position: story.position,
    category: story.category,
    region: story.region,
    headline_ar: story.headline_ar,
    summary_ar: story.summary_ar,
    why_it_matters_ar: story.why_it_matters_ar,
    source_id: story.source_id,
    source_name: story.source_name,
    source_url: story.source_url,
    source_published_at: story.source_published_at,
  }));

  let saved;
  try {
    [saved] = await request(
      `${base}/news_user_digests?on_conflict=user_id,digest_date`,
      config.key,
      {
        method: 'POST',
        prefer: 'resolution=merge-duplicates,return=representation',
        body: [
          {
            user_id: userId,
            digest_date: digest.digest_date,
            title: digest.title,
            lede: digest.lede,
            story_count: 0,
            model: digest.model,
            run_url: digest.run_url,
            published_at: new Date().toISOString(),
          },
        ],
      }
    );

    if (!saved?.id) throw new Error('the personal digest upsert returned no row');

    await request(`${base}/news_user_stories?digest_id=eq.${saved.id}`, config.key, {
      method: 'DELETE',
      prefer: 'return=minimal',
    });

    await request(`${base}/news_user_stories`, config.key, {
      method: 'POST',
      prefer: 'return=minimal',
      body: storyRows.map((story) => ({ ...story, digest_id: saved.id })),
    });

    await request(`${base}/news_user_digests?id=eq.${saved.id}`, config.key, {
      method: 'PATCH',
      prefer: 'return=minimal',
      body: { story_count: storyRows.length },
    });
  } catch (error) {
    if (eventId) {
      try {
        await request(`${base}/rpc/refund_credits`, config.key, {
          method: 'POST',
          body: { p_user_id: userId, p_event_id: eventId },
        });
      } catch (refundError) {
        log(
          `Refund failed for ${userId} (event ${eventId}): ${
            refundError instanceof Error ? refundError.message : refundError
          }`
        );
      }
    }
    throw error;
  }

  log(`Published ${storyRows.length} personal stories for ${digest.digest_date}`);
  return { id: saved.id, published: true, dryRun: false };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!options.digest) throw new Error('--digest is required');
  if (!/^[0-9a-f-]{36}$/i.test(options.user)) throw new Error('--user must be a UUID');

  const digest = JSON.parse(await readFile(options.digest, 'utf8'));
  const config = readConfig();
  await publishPersonalDigest({
    config,
    digest,
    userId: options.user,
    dryRun: options.dryRun,
  });
}

const invokedDirectly =
  process.argv[1] !== undefined && resolve(process.argv[1]).endsWith('publish-personal-digest.mjs');

if (invokedDirectly) {
  main().catch((error) => {
    console.error(
      `publish-personal-digest failed: ${error instanceof Error ? error.message : error}`
    );
    process.exitCode = 1;
  });
}
