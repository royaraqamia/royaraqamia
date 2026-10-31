/**
 * Vendors the Mushaf's boundaries — page, juz, hizb and sajda — into
 * `public/quran/meta/pages.json` (ADR-0057, P5).
 *
 * The source is the metadata file this project already vendors its sura list from:
 * Tanzil's `quran-data.xml`, under the same grant and the same notice as the text
 * (`public/quran/meta/NOTICE.txt`). The issue named the MIT `rn0x/Quran-Data`
 * mapping instead; this file carries the same 604-page Madani sequence and, unlike
 * that one, also carries the juz, quarter and sajda boundaries — so one source and
 * one licence answer the whole cut, and no second grant has to be read.
 *
 * Two blocks of that file are the boundaries, and the third is derived from them:
 *
 *   - `<pages>` — 604 entries, each a page's first Ayah. This is the page view's
 *     seam: the page-per-screen rendering waits on the KFGQPC licence, but the
 *     mapping itself is exact and is what both versions read.
 *   - `<juzs>` — 30 entries, each a juz's first Ayah.
 *   - `<hizbs>` — this block is 240 *quarters*, four to a hizb, so the hizbs are
 *     every fourth one. The script asserts that the juz boundaries it derives from
 *     the same quarters match the `<juzs>` block exactly, which is what makes the
 *     derivation a check rather than a guess.
 *   - `<sajdas>` — 15 entries, each with the type Tanzil publishes
 *     (`obligatory`/`recommended`).
 *
 * Every boundary is resolved against the vendored text before anything is written:
 * a boundary that names an Ayah the text does not have would render a mark on no
 * Ayah at all, silently.
 *
 * Usage:
 *   node scripts/vendor-quran-pages.mjs             # fetch, verify, write
 *   node scripts/vendor-quran-pages.mjs --dry-run   # fetch and report, write nothing
 */
import { readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const METADATA_URL = 'https://tanzil.net/res/text/metadata/quran-data.xml';
const OUT_DIR = join(ROOT, 'public', 'quran', 'meta');

/** The counts the printed Madani Mushaf has, and the shape the reader is built on. */
const PAGES = 604;
const JUZS = 30;
const QUARTERS = 240;
const HIZBS = 60;
const SAJDAS = 15;

const SAJDA_TYPES = new Set(['obligatory', 'recommended']);

function die(message) {
  console.error(`x ${message}`);
  process.exit(1);
}

/** One boundary block, as `<tag index sura aya>` entries. */
function boundaries(xml, tag) {
  const entries = [
    ...xml.matchAll(new RegExp(`<${tag} index="(\\d+)" sura="(\\d+)" aya="(\\d+)"`, 'g')),
  ].map((match) => ({ n: Number(match[1]), surah: Number(match[2]), ayah: Number(match[3]) }));

  // The file is published in order; anything else means the export changed shape.
  const ascending = entries.every(
    (entry, index) =>
      index === 0 ||
      entry.surah * 1000 + entry.ayah > entries[index - 1].surah * 1000 + entries[index - 1].ayah
  );
  if (!ascending) die(`<${tag}> is not in reading order`);
  if (entries.length === 0) die(`<${tag}> is empty`);
  entries.forEach((entry, index) => {
    if (entry.n !== index + 1 && tag !== 'sajda') {
      die(`<${tag}> entry ${index + 1} is numbered ${entry.n}`);
    }
  });

  return entries;
}

function sajdas(xml) {
  return [...xml.matchAll(/<sajda index="(\d+)" sura="(\d+)" aya="(\d+)" type="([a-z]+)"/g)].map(
    (match) => ({
      surah: Number(match[2]),
      ayah: Number(match[3]),
      type: match[4],
    })
  );
}

/** Every sura's Ayah count, from the text this repository already vendors. */
function ayahCounts() {
  const index = JSON.parse(
    readFileSync(join(ROOT, 'public', 'quran', 'meta', 'index.json'), 'utf8')
  );
  return new Map(index.surahs.map((surah) => [surah.n, surah.ayahCount]));
}

/** Refuses a boundary the text cannot hold: a mark on an Ayah that does not exist. */
function verify(points, counts, what) {
  for (const point of points) {
    const last = counts.get(point.surah);
    if (last === undefined) die(`${what} names sura ${point.surah}, which the text does not have`);
    if (point.ayah < 1 || point.ayah > last) {
      die(`${what} names ${point.surah}:${point.ayah}, past that sura's ${last} Ayat`);
    }
  }
}

const response = await fetch(METADATA_URL);
if (!response.ok) die(`${METADATA_URL} responded ${response.status}`);
const xml = await response.text();

const pages = boundaries(xml, 'page');
const juzs = boundaries(xml, 'juz');
const quarters = boundaries(xml, 'quarter');
const reminders = sajdas(xml);

if (pages.length !== PAGES) die(`expected ${PAGES} pages, got ${pages.length}`);
if (juzs.length !== JUZS) die(`expected ${JUZS} juzs, got ${juzs.length}`);
if (quarters.length !== QUARTERS) die(`expected ${QUARTERS} quarters, got ${quarters.length}`);
if (reminders.length !== SAJDAS) die(`expected ${SAJDAS} sajdas, got ${reminders.length}`);

// A page starts at the first Ayah of the Mushaf, and the juz that opens the text is
// the first entry of both blocks — the cheapest proof that the two agree.
if (pages[0].surah !== 1 || pages[0].ayah !== 1) die('the first page does not start at 1:1');
if (juzs[0].surah !== 1 || juzs[0].ayah !== 1) die('the first juz does not start at 1:1');

// The hizb and juz boundaries are both quarters: eight to a juz, four to a hizb.
const derivedJuzs = quarters
  .filter((quarter) => (quarter.n - 1) % 8 === 0)
  .map((quarter) => ({ n: (quarter.n - 1) / 8 + 1, surah: quarter.surah, ayah: quarter.ayah }));
if (JSON.stringify(derivedJuzs) !== JSON.stringify(juzs)) {
  die('the juz boundaries do not match the quarter boundaries they are derived from');
}

const hizbs = quarters
  .filter((quarter) => (quarter.n - 1) % 4 === 0)
  .map((quarter) => ({ n: (quarter.n - 1) / 4 + 1, surah: quarter.surah, ayah: quarter.ayah }));
if (hizbs.length !== HIZBS) die(`expected ${HIZBS} hizbs, got ${hizbs.length}`);

for (const sajda of reminders) {
  if (!SAJDA_TYPES.has(sajda.type))
    die(`sajda ${sajda.surah}:${sajda.ayah} has type ${sajda.type}`);
}

const counts = ayahCounts();
verify(pages, counts, 'a page');
verify(juzs, counts, 'a juz');
verify(hizbs, counts, 'a hizb');
verify(reminders, counts, 'a sajda');

const text = JSON.parse(readFileSync(join(ROOT, 'public', 'quran', 'meta', 'index.json'), 'utf8'));
const asset = {
  source: text.source,
  licence: text.license,
  notice: text.notice,
  pages,
  juzs,
  hizbs,
  sajdas: reminders,
};

const body = `${JSON.stringify(asset, null, 2)}\n`;

if (process.argv.includes('--dry-run')) {
  console.log(`dry run: ${pages.length} pages, ${juzs.length} juzs, ${hizbs.length} hizbs`);
  console.log(`dry run: ${reminders.length} sajdas, ${Buffer.byteLength(body)} bytes`);
} else {
  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(join(OUT_DIR, 'pages.json'), body, 'utf8');
  console.log(
    `pages ${pages.length}, juzs ${juzs.length}, hizbs ${hizbs.length}, sajdas ${reminders.length}` +
      ` → public/quran/meta/pages.json (${Buffer.byteLength(body)} bytes)`
  );
}
