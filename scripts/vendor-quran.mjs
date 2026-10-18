/**
 * Vendors the Quran text and its metadata from Tanzil into `public/quran/**`.
 *
 * The reader ships its own copy of the text rather than calling an API at read
 * time (ADR-0057), so the text has to exist in the repository, be reproducible,
 * and carry Tanzil's notice with it — the licence is CC BY 3.0, and "CHANGING IT
 * IS NOT ALLOWED", so this script is a copier and never an editor.
 *
 * Two exports are read from Tanzil, both under the same grant:
 *   - `outType=xml&quranType=uthmani` — the Uthmani text of Hafs ʿan ʿAsim.
 *     The basmalah arrives as a `bismillah` attribute on a sura's first ayah
 *     rather than inside its text, which is why the ayah text can be stored
 *     verbatim; Al-Fatiha's basmalah is its own ayah 1, and At-Tawba has none.
 *   - `quran-data.xml` — sura names, ayah counts, revelation place and order.
 *
 * The vendored output is committed. A correction is therefore a commit and a
 * cache-name bump, never an admin action (ADR-0057), and re-running this script
 * is expected to reproduce it byte for byte.
 *
 * Usage: node scripts/vendor-quran.mjs
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

const TEXT_URL =
  'https://tanzil.net/pub/download/index.php?agree=true&quranType=uthmani&outType=xml';
const METADATA_URL = 'https://tanzil.net/res/text/metadata/quran-data.xml';
const OUT_DIR = join(process.cwd(), 'public', 'quran');

/** The XML entities Tanzil's export can contain, and what they stand for. */
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

/**
 * Decodes an XML attribute value. The text must come out of here byte for byte
 * as Tanzil published it — an undecoded `&amp;` would be a change to the text,
 * which the licence forbids.
 */
function decodeXml(value) {
  return value.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, body) => {
    if (body.startsWith('#x') || body.startsWith('#X')) {
      return String.fromCodePoint(Number.parseInt(body.slice(2), 16));
    }
    if (body.startsWith('#')) return String.fromCodePoint(Number.parseInt(body.slice(1), 10));
    return ENTITIES[body] ?? match;
  });
}

/** Reads one attribute off a tag's source text, decoded. */
function attribute(tag, name) {
  const match = tag.match(new RegExp(`\\s${name}="([^"]*)"`));
  return match ? decodeXml(match[1]) : null;
}

async function fetchText(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} responded ${response.status}`);
  return response.text();
}

/** The verbatim copyright block Tanzil asks to be reproduced with the text. */
function notice(text) {
  const match = text.match(/<!--([\s\S]*?)-->/);
  if (!match) throw new Error('the text export has no copyright comment');
  return `${match[1].trim()}\n`;
}

/** The text export, one entry per sura, ayah text kept exactly as published. */
function parseText(text) {
  const suras = [];
  const suraTag = /<sura\s[^>]*>/g;
  const suraMatches = [...text.matchAll(suraTag)];

  suraMatches.forEach((match, position) => {
    const from = match.index + match[0].length;
    const to = position + 1 < suraMatches.length ? suraMatches[position + 1].index : text.length;
    const body = text.slice(from, to);
    const ayas = [...body.matchAll(/<aya\s[^>]*\/>/g)].map((aya) => aya[0]);

    suras.push({
      number: Number(attribute(match[0], 'index')),
      name: attribute(match[0], 'name'),
      // Only a sura's first ayah can carry it; it belongs to the sura, not the ayah.
      bismillah: ayas.length > 0 ? attribute(ayas[0], 'bismillah') : null,
      ayahs: ayas.map((aya) => attribute(aya, 'text')),
    });
  });

  return suras;
}

/** Tanzil's metadata export: the numbers and names the text export omits. */
function parseMetadata(text) {
  const suras = new Map();
  for (const match of text.matchAll(/<sura\s[^>]*\/>/g)) {
    suras.set(Number(attribute(match[0], 'index')), {
      name: attribute(match[0], 'name'),
      ayahCount: Number(attribute(match[0], 'ayas')),
      revelation: attribute(match[0], 'type'),
      revelationOrder: Number(attribute(match[0], 'order')),
    });
  }
  return suras;
}

/**
 * Refuses to write anything if the two exports disagree, or if either departs
 * from the shape the reader is built against.
 */
function reconcile(textSuras, metadataSuras) {
  if (textSuras.length !== 114) throw new Error(`expected 114 suras, got ${textSuras.length}`);
  if (metadataSuras.size !== 114)
    throw new Error(`expected 114 metadata suras, got ${metadataSuras.size}`);

  let ayahTotal = 0;
  const index = textSuras.map((sura) => {
    const meta = metadataSuras.get(sura.number);
    if (!meta) throw new Error(`sura ${sura.number} has no metadata`);
    if (meta.name !== sura.name) {
      throw new Error(
        `sura ${sura.number} is "${sura.name}" in the text and "${meta.name}" in the metadata`
      );
    }
    if (meta.ayahCount !== sura.ayahs.length) {
      throw new Error(
        `sura ${sura.number} has ${sura.ayahs.length} ayat, metadata says ${meta.ayahCount}`
      );
    }
    if (sura.ayahs.some((ayah) => ayah === null || ayah.length === 0)) {
      throw new Error(`sura ${sura.number} has an empty ayah`);
    }
    ayahTotal += sura.ayahs.length;
    return {
      n: sura.number,
      name: sura.name,
      ayahCount: meta.ayahCount,
      revelation: meta.revelation,
      revelationOrder: meta.revelationOrder,
    };
  });

  if (ayahTotal !== 6236) throw new Error(`expected 6236 ayat, got ${ayahTotal}`);
  if (textSuras[0]?.bismillah !== null)
    throw new Error("Al-Fatiha's basmalah is its ayah 1, not a sura prefix");
  if (textSuras[8]?.bismillah !== null) throw new Error('At-Tawba has no basmalah');
  for (const sura of textSuras.slice(1)) {
    if (sura.number !== 9 && sura.bismillah === null) {
      throw new Error(`sura ${sura.number} is missing its basmalah`);
    }
  }

  return index;
}

const fingerprint = (value) => createHash('sha256').update(value).digest('hex');

const textExport = await fetchText(TEXT_URL);
const metadataExport = await fetchText(METADATA_URL);

const textSuras = parseText(textExport);
const metadataSuras = parseMetadata(metadataExport);
const surahs = reconcile(textSuras, metadataSuras);
const copyright = notice(textExport);

await mkdir(join(OUT_DIR, 'surah'), { recursive: true });
await writeFile(join(OUT_DIR, 'NOTICE.txt'), copyright, 'utf8');
await writeFile(
  join(OUT_DIR, 'index.json'),
  `${JSON.stringify(
    {
      source: 'Tanzil Project (https://tanzil.net)',
      license: 'Creative Commons Attribution 3.0',
      notice: 'public/quran/NOTICE.txt',
      rivayah: 'Hafs ʿan ʿAsim, Uthmani',
      ayahCount: surahs.reduce((total, sura) => total + sura.ayahCount, 0),
      surahs,
    },
    null,
    2
  )}\n`,
  'utf8'
);

for (const sura of textSuras) {
  const name = `${String(sura.number).padStart(3, '0')}.json`;
  await writeFile(
    join(OUT_DIR, 'surah', name),
    `${JSON.stringify({ n: sura.number, name: sura.name, bismillah: sura.bismillah, ayahs: sura.ayahs }, null, 2)}\n`,
    'utf8'
  );
}

console.log(
  `suras ${surahs.length}, ayat ${surahs.reduce((total, sura) => total + sura.ayahCount, 0)}`
);
console.log(`text sha256 ${fingerprint(textExport)}`);
console.log(`metadata sha256 ${fingerprint(metadataExport)}`);
