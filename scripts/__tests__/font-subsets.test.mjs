import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { facePlans, fontPath } from '../subset-fonts.mjs';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const tokens = JSON.parse(await readFile(path.join(ROOT, 'shared/tokens/tokens.json'), 'utf8'));

/** The WOFF2 known-table indices (spec order); index 63 carries an inline tag. */
const KNOWN_TAGS = [
  'cmap',
  'head',
  'hhea',
  'hmtx',
  'maxp',
  'name',
  'OS/2',
  'post',
  'cvt ',
  'fpgm',
  'glyf',
  'loca',
  'prep',
  'CFF ',
  'VORG',
  'EBDT',
  'EBLC',
  'gasp',
  'hdmx',
  'kern',
  'LTSH',
  'PCLT',
  'VDMX',
  'vhea',
  'vmtx',
  'BASE',
  'GDEF',
  'GPOS',
  'GSUB',
  'EBSC',
  'JSTF',
  'MATH',
];

function base128(buffer, at) {
  let value = 0;
  for (let byte = 0; byte < 5; byte += 1) {
    const current = buffer[at.pos++];
    if (current === undefined || value > 0x0fffffff) {
      throw new Error('font subset: bad WOFF2 base128 length');
    }
    value = (value << 7) | (current & 0x7f);
    if (!(current & 0x80)) return value;
  }
  throw new Error('font subset: unterminated WOFF2 base128 length');
}

/** Walk the WOFF2 directory to the `cmap` table, decompressing only that table. */
async function woff2Cmap(font) {
  if (font.toString('ascii', 0, 4) !== 'wOF2') throw new Error('not a WOFF2 font');
  const count = font.readUInt16BE(12);
  const at = { pos: 48 };
  const directory = [];
  for (let index = 0; index < count; index += 1) {
    const flags = font[at.pos++];
    const known = flags & 0x3f;
    const tag = known === 0x3f ? font.toString('ascii', at.pos, (at.pos += 4)) : KNOWN_TAGS[known];
    const original = base128(font, at);
    const transform = flags >> 6;
    const length = transform === 0 ? original : base128(font, at);
    directory.push({ tag, length, transform });
  }
  const entry = directory.find((candidate) => candidate.tag === 'cmap');
  if (!entry) throw new Error('font subset: no cmap table');
  if (entry.transform !== 0) throw new Error('font subset: transformed cmap is unsupported');

  // The decompressed stream concatenates the tables in directory order.
  const { brotliDecompressSync } = await import('node:zlib');
  const stream = brotliDecompressSync(font.subarray(at.pos));
  const start = directory
    .slice(0, directory.indexOf(entry))
    .reduce((sum, item) => sum + item.length, 0);
  return stream.subarray(start, start + entry.length);
}

/** The Android asset is a plain sfnt: its table directory names cmap directly. */
function sfntCmap(font) {
  const count = font.readUInt16BE(4);
  for (let index = 0; index < count; index += 1) {
    const record = 12 + index * 16;
    if (font.toString('ascii', record, record + 4) === 'cmap') {
      const start = font.readUInt32BE(record + 8);
      return font.subarray(start, start + font.readUInt32BE(record + 12));
    }
  }
  throw new Error('font subset: no cmap table');
}

/**
 * The codepoints a `cmap` table actually maps, independent of what the
 * stylesheet declares. Format 4 covers the BMP and format 12 covers the full
 * range; anything else would need a different reader and fails loudly.
 */
function cmapCodepoints(cmap) {
  const points = new Set();
  const subtables = cmap.readUInt16BE(2);
  for (let index = 0; index < subtables; index += 1) {
    const record = 4 + index * 8;
    const offset = cmap.readUInt32BE(record + 4);
    const format = cmap.readUInt16BE(offset);

    if (format === 4) {
      const segmentCount = cmap.readUInt16BE(offset + 6) / 2;
      const ends = offset + 14;
      const starts = ends + segmentCount * 2 + 2;
      const deltas = starts + segmentCount * 2;
      const ranges = deltas + segmentCount * 2;
      for (let segment = 0; segment < segmentCount; segment += 1) {
        const start = cmap.readUInt16BE(starts + segment * 2);
        const end = cmap.readUInt16BE(ends + segment * 2);
        const delta = cmap.readInt16BE(deltas + segment * 2);
        const rangeOffset = cmap.readUInt16BE(ranges + segment * 2);
        for (let point = start; point <= end && point < 0xffff; point += 1) {
          let glyph = 0;
          if (rangeOffset === 0) {
            glyph = (point + delta) & 0xffff;
          } else {
            const at = ranges + segment * 2 + rangeOffset + (point - start) * 2;
            if (at + 2 > cmap.length) continue;
            const raw = cmap.readUInt16BE(at);
            glyph = raw === 0 ? 0 : (raw + delta) & 0xffff;
          }
          if (glyph !== 0) points.add(point);
        }
      }
    } else if (format === 12) {
      const groups = cmap.readUInt32BE(offset + 12);
      for (let group = 0; group < groups; group += 1) {
        const groupRecord = offset + 16 + group * 12;
        const start = cmap.readUInt32BE(groupRecord);
        const end = cmap.readUInt32BE(groupRecord + 4);
        for (let point = start; point <= end; point += 1) points.add(point);
      }
    }
  }
  return [...points].sort((a, b) => a - b);
}

const webFile = path.join(
  ROOT,
  'public',
  decodeURIComponent(tokens.font.digits.file).replace(/^\//, '')
);
const androidFile = path.join(ROOT, 'android/app/src/main/res/font/aref_ruqaa_digits.ttf');

async function webCodepoints() {
  return cmapCodepoints(await woff2Cmap(await readFile(webFile)));
}

async function androidCodepoints() {
  return cmapCodepoints(sfntCmap(await readFile(androidFile)));
}

describe('the subset tool', () => {
  it('reads each face and its ceiling from the manifest', () => {
    const plans = facePlans(tokens);
    const digits = plans.find((plan) => plan.name === 'digits');
    const heading = plans.find((plan) => plan.name === 'heading');

    expect(fontPath(tokens.font.digits.file)).toBe('Aref Ruqaa/ArefRuqaa-Digits.woff2');
    expect(digits.source).toBe(heading.file);
    expect(digits.keepText).toBe('0123456789');
    expect(heading.keepText).toBeNull();
    expect(digits.maxBytes).toBeLessThan(heading.maxBytes);
  });
});

describe('the digits face on both clients', () => {
  it('ships exactly the codepoints the token manifest declares', async () => {
    const [start, end] = [
      Number.parseInt(tokens.font.digits.unicodeRange.slice(2, 6), 16),
      Number.parseInt(tokens.font.digits.unicodeRange.slice(7, 11), 16),
    ];
    const declared = Array.from({ length: end - start + 1 }, (_, i) => start + i);
    expect(await webCodepoints()).toEqual(declared);
  });

  it('covers the same digits as the Android asset', async () => {
    const asciiDigits = (points) => points.filter((point) => point >= 0x30 && point <= 0x39);
    expect(asciiDigits(await webCodepoints())).toEqual(asciiDigits(await androidCodepoints()));
  });

  it('stays under 4 KiB, so it can be preloaded on every route', async () => {
    const bytes = (await readFile(webFile)).length;
    expect(bytes).toBeLessThanOrEqual(tokens.font.digits.maxBytes);
    expect(bytes).toBeLessThan(4096);
  });
});
