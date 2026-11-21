/**
 * One-time font subsetting for `public/fonts/**`.
 *
 * The bundled Arabic woff2 files ship with full Unicode coverage (~70KB each)
 * while the site renders almost exclusively Arabic script + basic Latin.
 * This rewrites each font in place, keeping only the codepoint ranges the
 * site can realistically render; glyphs outside those ranges gracefully fall
 * back to the system fonts declared in next/font's fallback stack.
 *
 * The Amiri Quran file is the exception: it exists only for the three
 * silent-letter marks, so it keeps exactly the code points the shared Quran
 * marks contract names rather than the broad Arabic range below.
 *
 * Safe to re-run: subsetting to the same range set is idempotent. Originals
 * remain recoverable from git history (pre-subset commits).
 *
 * Usage: node scripts/subset-fonts.mjs
 */
import { readFile, writeFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import subsetFont from 'subset-font';
import { QURAN_MARK_CODEPOINTS } from '../shared/contracts/quran-marks.mjs';

const FONTS_DIR = join(process.cwd(), 'public', 'fonts');

/**
 * Amiri Quran is not a body face here: it draws exactly the three silent-letter
 * marks the Uthmani face gets wrong (ADR 0067), and its `unicode-range` never
 * lets it set a letter. Subsetting it to the same code points the declaration
 * names takes it from 45,680 B to 836 B, so a sura that uses the marks fetches
 * under a kilobyte at paint instead of a whole Quran face at preload priority.
 */
const MARKS_FONT = join('Amiri Quran', 'AmiriQuran-Regular.woff2');
const marksKeepText = String.fromCodePoint(...QURAN_MARK_CODEPOINTS);

// Arabic core + Latin basics + punctuation/digits.
// Presentation Forms A/B (FB50–FDFF, FE70–FEFF) are intentionally excluded:
// modern shaping engines compose Arabic from the base block via OpenType
// features, and a scan of both this repository's sources and the production
// database (posts + certificates) found zero literal presentation-form
// codepoints. Superset on purpose elsewhere: missing glyphs degrade to
// system fallbacks silently, so generous ranges cost a few KB but eliminate
// regression risk.
const RANGES = [
  [0x0020, 0x007e], // Basic Latin
  [0x00a0, 0x00ff], // Latin-1 Supplement
  [0x0600, 0x06ff], // Arabic
  [0x0750, 0x077f], // Arabic Supplement
  [0x08a0, 0x08ff], // Arabic Extended-A
  [0x2000, 0x206f], // General Punctuation
];

async function collectWoff2Files(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await collectWoff2Files(full)));
    else if (entry.name.endsWith('.woff2')) files.push(full);
  }
  return files;
}

const codepoints = RANGES.flatMap(([start, end]) =>
  Array.from({ length: end - start + 1 }, (_, i) => start + i)
);
const keepText = String.fromCodePoint(...codepoints);

for (const file of await collectWoff2Files(FONTS_DIR)) {
  const input = await readFile(file);
  const output = await subsetFont(input, file.endsWith(MARKS_FONT) ? marksKeepText : keepText, {
    targetFormat: 'woff2',
  });
  if (output.length >= input.length) {
    console.log(`skipped (no gain): ${file} (${input.length}B)`);
    continue;
  }
  await writeFile(file, output);
  const pct = Math.round((1 - output.length / input.length) * 100);
  console.log(`subset -${pct}%: ${file} ${input.length}B -> ${output.length}B`);
}
