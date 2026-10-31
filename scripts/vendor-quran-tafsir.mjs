/**
 * Vendors one Tafsir into the build (ADR-0057).
 *
 * The reader must open a Tafsir with no third party in the path of the page view,
 * for the same reason the text is vendored: a first read without a network has to
 * work, and a source we query at read time is one we cannot verify from here. So
 * the edition is fetched **once**, out of band, and committed as a static asset
 * under `public/quran/tafsir/<slug>/`.
 *
 * Two rules make this a copier and never an editor (ADR-0057: the text is verbatim
 * by licence):
 *   - the Ayah's `text_raw` is stored exactly as served — no shortening, no
 *     reformatting, no markup;
 *   - nothing is filled in. An Ayah the source does not cover is stored as
 *     `null`, not borrowed from a neighbouring Ayah.
 *
 * Where it comes from: **Tafsir Center for Quranic Studies' own corpus**, under
 * its CC BY 4.0 grant, through the endpoint its published MCP server exposes
 * (`mcp.tafsir.net`), which is the searchable surface over that corpus. The
 * edition's own attribution — published by the registry, not typed by us — is
 * stored beside its text and rendered with it, because ADR-0065 removed the
 * Quran pages' colophon and the credit that licences ask for now travels with the
 * licensed content instead of the surface.
 *
 * Usage:
 *   node scripts/vendor-quran-tafsir.mjs                 # every Surah, missing ones only
 *   node scripts/vendor-quran-tafsir.mjs --surah 1        # one Surah
 *   node scripts/vendor-quran-tafsir.mjs --surah 1,2,3    # a few
 *   node scripts/vendor-quran-tafsir.mjs --force          # re-fetch what is already here
 *   node scripts/vendor-quran-tafsir.mjs --dry-run        # fetch and report, write nothing
 *   node scripts/vendor-quran-tafsir.mjs --slug=moyassar  # the edition to vendor
 *
 * A run is restartable: a Surah with a file is skipped unless `--force`, so an
 * interrupted pass resumes where it stopped. `manifest.json` is written after each
 * Surah, so what is on disk and what the manifest claims never disagree.
 *
 * Needs no secrets. It is a one-off invocation, then the output is a commit.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TEXT_INDEX = join(ROOT, 'public', 'quran', 'meta', 'index.json');
const TAFSIR_DIR = join(ROOT, 'public', 'quran', 'tafsir');

const ENDPOINT = 'https://mcp.tafsir.net/mcp';
const PROTOCOL_VERSION = '2025-06-18';

/** The edition this project ships, as ADR-0057 records the choice. */
const DEFAULT_SLUG = 'moyassar';

/**
 * The grant, quoted rather than paraphrased: ADR-0057 relies on Tafsir Center's
 * own CC BY 4.0 publication over the editions it compiles, and the page that
 * credit lives on is this one.
 */
const GRANT = {
  holder: 'Tafsir Center for Quranic Studies',
  holderAr: 'مركز تفسير للدراسات القرآنية',
  licence: 'CC BY 4.0',
  licenceUrl: 'https://creativecommons.org/licenses/by/4.0/',
  source: 'https://tafsir.net',
  corpus: 'https://mcp.tafsir.net/mcp',
};

function parseArgs(argv) {
  const options = { slug: DEFAULT_SLUG, surahs: null, force: false, dryRun: false };
  for (const arg of argv) {
    if (arg === '--force') options.force = true;
    else if (arg === '--dry-run') options.dryRun = true;
    else if (arg.startsWith('--slug=')) options.slug = arg.slice('--slug='.length);
    else if (arg.startsWith('--surah=')) {
      options.surahs = arg
        .slice('--surah='.length)
        .split(',')
        .map((value) => Number(value.trim()))
        .filter((value) => Number.isInteger(value) && value >= 1 && value <= 114);
    } else if (arg === '--surah') {
      throw new Error('use --surah=<n>,<n>');
    }
  }
  return options;
}

/** One JSON-RPC call over the endpoint's streamable-HTTP transport. */
async function rpc(session, body) {
  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      ...(session.id ? { 'mcp-session-id': session.id } : {}),
    },
    body: JSON.stringify(body),
  });

  const nextId = response.headers.get('mcp-session-id');
  if (nextId) session.id = nextId;

  if (!response.ok) throw new Error(`endpoint responded ${response.status}`);
  const text = await response.text();
  const data = text.split(/\ndata: /).at(-1);
  // A notification is answered with nothing; that is an answer, not a failure.
  if (!data || data.trim().length === 0) return null;
  const message = JSON.parse(data);
  if (message.error) throw new Error(`endpoint error: ${JSON.stringify(message.error)}`);
  return message.result;
}

async function connect() {
  const session = { id: null };
  await rpc(session, {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: 'royaraqamia-vendor', version: '1.0.0' },
    },
  });
  await rpc(session, { jsonrpc: '2.0', method: 'notifications/initialized' });
  return session;
}

/** Retries a call that failed for a reason that may pass. */
async function withRetries(run, attempts = 4) {
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await run();
    } catch (error) {
      lastError = error;
      await new Promise((done) => setTimeout(done, 500 * attempt));
    }
  }
  throw lastError;
}

/**
 * One Ayah's entry: its verbatim text, or `null` when this edition does not cover
 * it. A row longer than the endpoint's window arrives in parts, in order, and the
 * parts are joined exactly once — the read is reconstructed, never rewritten.
 */
async function fetchAyah(session, slug, surah, ayah, id) {
  const parts = [];
  let attribution = null;
  let part = 1;
  let totalParts = 1;

  do {
    const result = await withRetries(() =>
      rpc(session, {
        jsonrpc: '2.0',
        id,
        method: 'tools/call',
        params: { name: 'fetch_tafsir', arguments: { surah, ayah, sources: [slug], part } },
      })
    );

    const payload = JSON.parse(result.content[0].text);
    const entry = payload.tafsirs?.find((candidate) => candidate.source === slug);
    if (!entry) return { ayah, text: null };

    if (entry.attribution) attribution = entry.attribution;
    const text = entry.text_raw ?? entry.text ?? '';
    if (text.trim().length > 0) parts.push(text.trim());
    totalParts = entry.total_parts ?? totalParts;
    part += 1;
  } while (part <= totalParts);

  return { ayah, text: parts.length > 0 ? parts.join('\n\n') : null, attribution };
}

/** Runs `task` over `items` with a small ceiling, preserving order in the output. */
async function mapWithConcurrency(items, limit, task) {
  const results = new Array(items.length);
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await task(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function vendorSurah(session, slug, surah, dryRun) {
  const ayat = Array.from({ length: surah.ayahCount }, (_, index) => index + 1);
  const entries = await mapWithConcurrency(ayat, 4, (ayah, index) =>
    fetchAyah(session, slug, surah.n, ayah, 10_000 + index)
  );

  const attribution = entries.find((entry) => entry.attribution)?.attribution ?? null;
  const file = {
    edition: slug,
    surah: surah.n,
    name: surah.name,
    ayahCount: surah.ayahCount,
    attribution,
    source: GRANT.source,
    licence: GRANT.licence,
    ayat: entries.map((entry) => ({ ayah: entry.ayah, text: entry.text })),
  };

  const body = `${JSON.stringify(file, null, 2)}\n`;
  const missing = file.ayat.filter((entry) => entry.text === null).length;

  if (!dryRun) {
    const dir = join(TAFSIR_DIR, slug);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, `${String(surah.n).padStart(3, '0')}.json`), body, 'utf8');
  }

  return {
    surah: surah.n,
    bytes: Buffer.byteLength(body),
    sha256: createHash('sha256').update(body).digest('hex'),
    covered: file.ayahCount - missing,
    missing,
    attribution,
  };
}

function readManifest(slug, ayat) {
  const path = join(TAFSIR_DIR, slug, 'manifest.json');
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, 'utf8'));
}

async function writeManifest(slug, surahs, totals) {
  const body = {
    edition: slug,
    ...GRANT,
    suras: surahs.length,
    ayat: totals.ayat,
    covered: totals.covered,
    bytes: totals.bytes,
    complete: totals.covered === totals.ayat,
    surahs: surahs.sort((a, b) => a.surah - b.surah),
  };
  const dir = join(TAFSIR_DIR, slug);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, 'manifest.json'), `${JSON.stringify(body, null, 2)}\n`, 'utf8');

  const index = {
    editions: [
      {
        id: slug,
        name: 'التفسير الميسر',
        author: surahs.find((entry) => entry.author)?.author ?? null,
        licence: GRANT.licence,
        licenceUrl: GRANT.licenceUrl,
        source: GRANT.source,
        corpus: GRANT.corpus,
        attribution: surahs.find((entry) => entry.attribution)?.attribution ?? null,
        suras: body.suras,
        ayat: body.ayat,
        covered: body.covered,
        bytes: body.bytes,
        complete: body.complete,
      },
    ],
  };
  await writeFile(
    join(TAFSIR_DIR, slug, 'index.json'),
    `${JSON.stringify(index, null, 2)}\n`,
    'utf8'
  );

  const notice = [
    `التفسير: ${index.editions[0].name}`,
    `المصدر: ${GRANT.holderAr} — ${GRANT.source}`,
    `الإسناد كما ينشره المصدر: ${index.editions[0].attribution ?? '(غير متوفّر)'}`,
    `الرخصة: ${GRANT.licence} — ${GRANT.licenceUrl}`,
    '',
    `Corpus: ${GRANT.corpus} (Tafsir Center for Quranic Studies, CC BY 4.0).`,
    'Vendored verbatim: no shortening, no reformatting, no markup added.',
    'An Ayah this edition does not cover is stored as null, never borrowed.',
  ].join('\n');
  await writeFile(join(TAFSIR_DIR, slug, 'NOTICE.txt'), `${notice}\n`, 'utf8');
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const text = JSON.parse(readFileSync(TEXT_INDEX, 'utf8'));
  const wanted = options.surahs
    ? text.surahs.filter((surah) => options.surahs.includes(surah.n))
    : text.surahs;

  console.log(`Vendoring ${options.slug}: ${wanted.length} Surah(s)`);

  const session = await connect();
  const done = [];
  const totals = { ayat: 0, covered: 0, bytes: 0 };
  const existing = readManifest(options.slug);

  for (const surah of wanted) {
    const path = join(TAFSIR_DIR, options.slug, `${String(surah.n).padStart(3, '0')}.json`);
    if (!options.force && existsSync(path) && existing?.surahs) {
      const known = existing.surahs.find((entry) => entry.surah === surah.n);
      if (known) {
        done.push(known);
        totals.ayat += surah.ayahCount;
        totals.covered += known.covered;
        totals.bytes += known.bytes;
        console.log(`  ${surah.n}/114 ${surah.name}: already vendored`);
        continue;
      }
    }

    const result = await vendorSurah(session, options.slug, surah, options.dryRun);
    done.push(result);
    totals.ayat += surah.ayahCount;
    totals.covered += result.covered;
    totals.bytes += result.bytes;
    console.log(
      `  ${surah.n}/114 ${surah.name}: ${result.covered}/${surah.ayahCount} Ayat, ${result.bytes} bytes${
        result.missing > 0 ? `, ${result.missing} uncovered` : ''
      }`
    );

    if (!options.dryRun) await writeManifest(options.slug, done, totals);
  }

  if (!options.dryRun) await writeManifest(options.slug, done, totals);
  console.log(
    `Done: ${totals.covered}/${totals.ayat} Ayat, ${(totals.bytes / 1024 / 1024).toFixed(2)} MiB`
  );
}

await main();
