#!/usr/bin/env node
import process from 'node:process';
import { pathToFileURL } from 'node:url';

/**
 * What the edge must be doing, measured rather than assumed.
 *
 * The public documents carry `s-maxage` (ADR-0175) but Cloudflare does not cache
 * HTML without a Cache Rule; before this check existed the live site answered
 * `cf-cache-status: DYNAMIC` for `/` and `/community/explore`, so every pageview
 * reached the 0.1-CPU origin. The rules live in the Cloudflare dashboard
 * (`docs/edge-cache.md`); this script is their regression test.
 *
 * It asserts two things a rule can get wrong:
 *   - a public path is served from the edge (HIT, or REVALIDATED on the request
 *     that refreshes an expired entry), and
 *   - a private path is never served from the edge, and the feed still says
 *     `private, no-store`.
 *
 * It cannot prove the authenticated case without a member's cookie: a signed-out
 * `/account` redirects and a signed-out `/api/me` answers 401, and neither is
 * cacheable anyway. The header assertions are what carry that invariant.
 */

export const DEFAULT_BASE = 'https://royaraqamia.com';

/** Public, cookie-free documents. Keep this list in step with the Cache Rule. */
export const PUBLIC_PATHS = [
  '/',
  '/terms',
  '/privacy',
  '/security',
  '/pricing',
  '/app-info',
  '/mcp/guide',
  '/community/explore',
  '/quran/1',
  '/athkar/evening',
  '/verify',
];

/** Paths that must never be cached, whether or not the visitor is signed in. */
export const PRIVATE_PATHS = [
  '/community',
  '/admin',
  '/notifications',
  '/api/me',
  '/api/notifications',
];

const CACHE_HITS = new Set(['hit', 'revalidated']);

export function isCacheHit(status) {
  return CACHE_HITS.has(String(status ?? '').toLowerCase());
}

export function publicVerdict(probe) {
  if (probe.status !== 200) return { ok: false, reason: `status ${probe.status}` };
  if (!isCacheHit(probe.cache)) {
    return { ok: false, reason: `cf-cache-status ${probe.cache ?? 'missing'}` };
  }
  return { ok: true, reason: probe.cache };
}

export function privateVerdict(probe) {
  if (isCacheHit(probe.cache)) return { ok: false, reason: `cached (${probe.cache})` };
  const personalized = probe.path === '/community' || probe.path.startsWith('/u/');
  if (personalized && !/private|no-store/i.test(probe.cacheControl ?? '')) {
    return {
      ok: false,
      reason: `cache-control ${probe.cacheControl ?? 'missing'} — expected private/no-store`,
    };
  }
  return { ok: true, reason: probe.cache ?? 'not cached' };
}

async function probe(base, path, { redirect = 'manual' } = {}) {
  const response = await fetch(new URL(path, base), {
    redirect,
    headers: { 'user-agent': 'royaraqamia-edge-check/1' },
  });
  await response.arrayBuffer().catch(() => {});
  return {
    path,
    status: response.status,
    cache: response.headers.get('cf-cache-status'),
    cacheControl: response.headers.get('cache-control'),
  };
}

function readArgs(argv) {
  const args = { base: process.env.SITE_BASE_URL || DEFAULT_BASE, json: false };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--base' && argv[i + 1]) {
      args.base = argv[i + 1];
      i += 1;
    } else if (argv[i] === '--json') {
      args.json = true;
    }
  }
  return args;
}

function report(rows, failures, { base, json }) {
  if (json) {
    console.log(JSON.stringify({ base, rows, failures }, null, 2));
    return;
  }
  for (const row of rows) {
    const mark = row.verdict.ok ? 'PASS' : 'FAIL';
    console.log(
      `${mark}  ${row.kind.padEnd(7)} ${row.path.padEnd(24)} ${(row.cache ?? '-').padEnd(11)} ${row.verdict.reason}`
    );
  }
  console.log('');
  console.log(
    failures.length === 0
      ? `edge cache looks right on ${base}`
      : `${failures.length} failed on ${base}`
  );
}

export async function main(argv = process.argv.slice(2)) {
  const args = readArgs(argv);
  const rows = [];
  const failures = [];

  for (const path of PUBLIC_PATHS) {
    // The first request is what fills the edge; the second is the answer.
    await probe(args.base, path);
    const answer = await probe(args.base, path);
    const verdict = publicVerdict(answer);
    rows.push({ kind: 'public', path, cache: answer.cache, verdict });
    if (!verdict.ok) failures.push(`${path}: ${verdict.reason}`);
  }

  const asset = await findStaticAsset(args.base);
  if (asset) {
    await probe(args.base, asset);
    const answer = await probe(args.base, asset);
    const verdict = publicVerdict(answer);
    rows.push({ kind: 'static', path: asset, cache: answer.cache, verdict });
    if (!verdict.ok) failures.push(`${asset}: ${verdict.reason}`);
  } else {
    failures.push('the document carried no /_next/static script to check');
  }

  const image = await findOptimizedImage(args.base);
  if (image) {
    await probe(args.base, image);
    const answer = await probe(args.base, image);
    const verdict = publicVerdict(answer);
    rows.push({ kind: 'image', path: image, cache: answer.cache, verdict });
    if (!verdict.ok) failures.push(`${image}: ${verdict.reason}`);
  }

  for (const path of PRIVATE_PATHS) {
    const answer = await probe(args.base, path);
    const verdict = privateVerdict(answer);
    rows.push({ kind: 'private', path, cache: answer.cache, verdict });
    if (!verdict.ok) failures.push(`${path}: ${verdict.reason}`);
  }

  // A profile renders the viewer's follow state into the HTML, so it is the
  // path a too-wide rule is most likely to leak. Discover one from the public
  // hub rather than hard-coding a member who may leave.
  const profile = await findProfile(args.base);
  if (profile) {
    const answer = await probe(args.base, profile);
    const verdict = privateVerdict(answer);
    rows.push({ kind: 'private', path: profile, cache: answer.cache, verdict });
    if (!verdict.ok) failures.push(`${profile}: ${verdict.reason}`);
  }

  report(rows, failures, args);
  return failures.length;
}

async function findProfile(base) {
  const response = await fetch(new URL('/community/explore', base), {
    headers: { 'user-agent': 'royaraqamia-edge-check/1' },
  });
  const html = await response.text();
  return /\/u\/[^"'\s]+/.exec(html)?.[0] ?? null;
}

async function findOptimizedImage(base) {
  const response = await fetch(new URL('/community/explore', base), {
    headers: { 'user-agent': 'royaraqamia-edge-check/1' },
  });
  const html = await response.text();
  const src = /\/_next\/image\?[^"'\s]+/.exec(html)?.[0];
  return src ? src.replaceAll('&amp;', '&') : null;
}

async function findStaticAsset(base) {
  const response = await fetch(new URL('/', base), {
    headers: { 'user-agent': 'royaraqamia-edge-check/1' },
  });
  const html = await response.text();
  return /\/_next\/static\/[^"'\s]+\.js/.exec(html)?.[0] ?? null;
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  process.exitCode = await main();
}
