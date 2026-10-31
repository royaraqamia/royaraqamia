/**
 * Builds the Quran search index from the vendored text (ADR-0057, P4).
 *
 * The asset is **the verbatim text, in reading order, in one array**. It is not a
 * pre-normalized corpus, and that is deliberate: a hit is shown to the reader in
 * the Ayah's own writing with the match marked, so the bytes on display have to be
 * the Mushaf's. `shared/contracts/quran-search.ts` folds a comparison copy in the
 * browser, from this same asset, with the same function the query uses.
 *
 * What that costs: the asset is the text's own size rather than a stripped copy of
 * it, which is why the budget below is stated in compressed terms — the ceiling
 * the page load actually pays.
 *
 * Nothing is fetched. The input is `public/quran/meta/index.json` and the 114 sura
 * files, so a re-run is byte-for-byte reproducible and needs no network. The build
 * refuses to write an index that does not cover the whole text, and `--check`
 * compares the files on disk against a fresh build without touching them.
 *
 * Tanzil's terms require the copyright block "in all files derived from or
 * containing substantial portion of this text", so this asset names the notice it
 * travels with (`public/quran/meta/NOTICE.txt`) and the sura page renders the text
 * from the same source. The notice is not restated here — one copy, one place.
 *
 * Usage:
 *   node scripts/build-quran-search-index.mjs           # write the asset
 *   node scripts/build-quran-search-index.mjs --check   # fail if stale or over budget
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const TEXT_DIR = join(ROOT, 'public', 'quran');
const OUT_DIR = join(TEXT_DIR, 'search');
const INDEX_PATH = join(OUT_DIR, 'index.json');
const MANIFEST_PATH = join(OUT_DIR, 'manifest.json');

/** The normalizer the browser will fold this text with (see the shared contract). */
const NORMALIZER = 1;
const SCHEMA = 1;

/**
 * The ceiling the page load pays, not the size of the file on disk.
 *
 * The whole text is 1.27 MiB raw and 0.25 MiB compressed (ADR-0057), so the asset
 * cannot be smaller than the text it carries: 320 KiB of gzipped JSON is the text
 * plus its overhead with room to spare, and anything past it means the index has
 * started carrying something it should not.
 */
export const BUDGET_GZIP_BYTES = 320 * 1024;
export const BUDGET_RAW_BYTES = 1_600 * 1024;

function die(message) {
  console.error(`x ${message}`);
  process.exit(1);
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

/**
 * The whole text, in reading order. Every sura file is checked against the index
 * rather than trusted: an index built over a short sura would silently lose the
 * Ayat at the end of the Quran.
 */
export function readCorpus() {
  const index = readJson(join(TEXT_DIR, 'meta', 'index.json'));
  if (!Array.isArray(index.surahs) || index.surahs.length !== 114) {
    die(`expected 114 suras in meta/index.json, got ${index.surahs?.length ?? 0}`);
  }

  const ayahs = [];
  for (const surah of index.surahs) {
    const path = join(TEXT_DIR, 'surah', `${String(surah.n).padStart(3, '0')}.json`);
    if (!existsSync(path)) die(`missing ${relative(ROOT, path)}`);
    const file = readJson(path);

    if (file.n !== surah.n) die(`sura ${surah.n} stores itself as sura ${file.n}`);
    if (!Array.isArray(file.ayahs) || file.ayahs.length !== surah.ayahCount) {
      die(`sura ${surah.n} has ${file.ayahs?.length ?? 0} ayat, the index says ${surah.ayahCount}`);
    }
    for (const ayah of file.ayahs) {
      if (typeof ayah !== 'string' || ayah.length === 0) {
        die(`sura ${surah.n} has an empty ayah`);
      }
      ayahs.push(ayah);
    }
  }

  const total = index.surahs.reduce((sum, surah) => sum + surah.ayahCount, 0);
  if (ayahs.length !== total) die(`expected ${total} ayat, read ${ayahs.length}`);
  if (total !== 6236) die(`expected 6236 ayat, the index adds to ${total}`);

  return { index, ayahs };
}

/** The asset and its manifest, exactly as they will be written. */
export function build() {
  const { index, ayahs } = readCorpus();

  // Compact on purpose: one Ayah per array entry is the whole file, and two
  // spaces of indentation would spend ~7% of the budget on whitespace no reader
  // ever parses.
  const asset = {
    schema: SCHEMA,
    source: index.source,
    licence: index.license,
    notice: index.notice,
    normalizer: NORMALIZER,
    ayahs,
  };
  const body = `${JSON.stringify(asset)}\n`;
  const bytes = Buffer.byteLength(body);
  const gzipBytes = gzipSync(Buffer.from(body)).length;
  const sha256 = createHash('sha256').update(body).digest('hex');

  const manifest = {
    schema: SCHEMA,
    normalizer: NORMALIZER,
    path: '/quran/search/index.json',
    notice: index.notice,
    source: index.source,
    licence: index.license,
    ayahs: ayahs.length,
    bytes,
    gzipBytes,
    sha256,
  };

  return {
    body,
    manifest: `${JSON.stringify(manifest, null, 2)}\n`,
    bytes,
    gzipBytes,
    sha256,
  };
}

function report({ bytes, gzipBytes }) {
  console.log(
    `  index ${(bytes / 1024).toFixed(0)} KiB raw, ${(gzipBytes / 1024).toFixed(0)} KiB gzipped`
  );
}

function check() {
  const built = build();
  report(built);

  if (built.gzipBytes > BUDGET_GZIP_BYTES) {
    die(
      `the index is ${(built.gzipBytes / 1024).toFixed(0)} KiB gzipped, over the ` +
        `${BUDGET_GZIP_BYTES / 1024} KiB budget`
    );
  }
  if (built.bytes > BUDGET_RAW_BYTES) {
    die(
      `the index is ${(built.bytes / 1024).toFixed(0)} KiB raw, over the ` +
        `${BUDGET_RAW_BYTES / 1024} KiB budget`
    );
  }

  for (const [path, expected] of [
    [INDEX_PATH, built.body],
    [MANIFEST_PATH, built.manifest],
  ]) {
    if (!existsSync(path)) die(`${relative(ROOT, path)} is missing; run the builder`);
    if (readFileSync(path, 'utf8') !== expected) {
      die(`${relative(ROOT, path)} is stale; run the builder`);
    }
  }

  console.log('  ok the search index is current and inside its budget');
}

async function write() {
  const built = build();
  report(built);

  if (built.gzipBytes > BUDGET_GZIP_BYTES || built.bytes > BUDGET_RAW_BYTES) {
    die('the index is over its budget; refusing to write it');
  }

  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(INDEX_PATH, built.body, 'utf8');
  await writeFile(MANIFEST_PATH, built.manifest, 'utf8');
  console.log(`  wrote ${relative(ROOT, INDEX_PATH)} (sha256 ${built.sha256.slice(0, 8)})`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--check')) check();
  else await write();
}
