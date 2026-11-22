/**
 * Font subsetting for `public/fonts/**`, driven by `shared/tokens/tokens.json`.
 *
 * The bundled Arabic woff2 files ship with full Unicode coverage (~70KB each)
 * while the site renders almost exclusively Arabic script + basic Latin.
 * This rewrites each font in place, keeping only the codepoint ranges the
 * site can realistically render; glyphs outside those ranges gracefully fall
 * back to the system fonts declared in next/font's fallback stack.
 *
 * Two faces need a narrower cut than that directory-wide sweep (ADR-0089):
 * Amiri Quran exists only for the three silent-letter marks, and the digits
 * face exists only for `U+0030-0039`. Both declare their codepoints in the
 * token manifest; the digits face also names the file it is cut from and a
 * `maxBytes` ceiling, so re-running this script regenerates the same 2.4KB
 * subset instead of quietly replacing it with the whole Arabic face.
 *
 * Safe to re-run: subsetting to the same range set is idempotent. Originals
 * remain recoverable from git history (pre-subset commits).
 *
 * Usage: node scripts/subset-fonts.mjs
 */
import { readFile, writeFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import subsetFont from 'subset-font';
import { QURAN_MARK_CODEPOINTS } from '../shared/contracts/quran-marks.mjs';
import { fontBudget, unicodeRange } from './generate-tokens.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FONTS_DIR = path.join(ROOT, 'public', 'fonts');
const SOURCE = 'shared/tokens/tokens.json';

/** Amiri Quran is not a body face: it draws exactly the three marks (ADR 0067). */
const MARKS_FONT = 'Amiri Quran/AmiriQuran-Regular.woff2';
const marksKeepText = String.fromCodePoint(...QURAN_MARK_CODEPOINTS);

/**
 * The Uthmani face is covered by a EULA that forbids modification, so it is
 * never rewritten — not even by the broad sweep. It ships as licensed.
 */
const LOCKED_FONTS = new Set([
  'KFGQPC HAFS Uthmanic Script/KFGQPCHAFSUthmanicScript-Regular.woff2',
]);

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

const broadKeepText = String.fromCodePoint(
  ...RANGES.flatMap(([start, end]) => Array.from({ length: end - start + 1 }, (_, i) => start + i))
);

/** A manifest URL (`/fonts/Aref%20Ruqaa/...`) to a path under `public/fonts`. */
export function fontPath(url) {
  if (typeof url !== 'string' || !url.startsWith('/fonts/')) {
    throw new Error(`subset-fonts: "${url}" is not a /fonts/ URL`);
  }
  return decodeURIComponent(url.slice('/fonts/'.length));
}

/**
 * One plan per hand-declared Aref face: the file to price, the codepoints it
 * keeps (null means the broad sweep), its source if it is derived, and the
 * ceiling the manifest promises. A face with no `unicodeRange` keeps the
 * directory-wide Arabic+Latin ranges.
 */
export function facePlans(tokens) {
  return ['heading', 'digits'].map((name) => {
    const face = tokens.font[name];
    if (!face?.file) {
      throw new Error(`subset-fonts: font "${name}" has no "file"`);
    }
    const plan = {
      name,
      file: fontPath(face.file),
      maxBytes: fontBudget(face, name),
      source: face.source ? fontPath(face.source) : null,
      keepText: null,
    };
    if (face.unicodeRange) {
      const [start, end] = unicodeRange(face.unicodeRange);
      if (start > end) {
        throw new Error(`subset-fonts: "${face.unicodeRange}" runs backwards`);
      }
      plan.keepText = String.fromCodePoint(
        ...Array.from({ length: end - start + 1 }, (_, i) => start + i)
      );
    }
    return plan;
  });
}

async function collectWoff2Files(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await collectWoff2Files(full)));
    else if (entry.name.endsWith('.woff2')) files.push(full);
  }
  return files;
}

async function main() {
  const tokens = JSON.parse(await readFile(path.join(ROOT, SOURCE), 'utf8'));
  const plans = facePlans(tokens);
  const planned = new Map(
    plans.filter((plan) => plan.keepText).map((plan) => [plan.file, plan.keepText])
  );
  const derived = plans.filter((plan) => plan.source);
  const derivedFiles = new Set(derived.map((plan) => plan.file));

  for (const plan of derived) {
    if (!plans.some((candidate) => candidate.file === plan.source)) {
      throw new Error(
        `subset-fonts: font "${plan.name}" cuts from "${plan.source}", which is no declared face`
      );
    }
  }

  for (const file of await collectWoff2Files(FONTS_DIR)) {
    const relative = path.relative(FONTS_DIR, file).split(path.sep).join('/');
    if (derivedFiles.has(relative) || LOCKED_FONTS.has(relative)) continue;

    const input = await readFile(file);
    const keepText =
      relative === MARKS_FONT ? marksKeepText : (planned.get(relative) ?? broadKeepText);
    const output = await subsetFont(input, keepText, { targetFormat: 'woff2' });
    if (output.length >= input.length) {
      console.log(`skipped (no gain): ${relative} (${input.length}B)`);
      continue;
    }
    await writeFile(file, output);
    const pct = Math.round((1 - output.length / input.length) * 100);
    console.log(`subset -${pct}%: ${relative} ${input.length}B -> ${output.length}B`);
  }

  for (const plan of derived) {
    const input = await readFile(path.join(FONTS_DIR, plan.source));
    const output = await subsetFont(input, plan.keepText, { targetFormat: 'woff2' });
    if (output.length > plan.maxBytes) {
      throw new Error(
        `subset-fonts: font "${plan.name}" is ${output.length}B, over its ${plan.maxBytes}B ceiling`
      );
    }
    await writeFile(path.join(FONTS_DIR, plan.file), output);
    console.log(
      `subset ${plan.name}: ${path.join('public', 'fonts', plan.file)} ${input.length}B -> ${output.length}B`
    );
  }

  for (const plan of plans) {
    const bytes = (await readFile(path.join(FONTS_DIR, plan.file))).length;
    if (bytes > plan.maxBytes) {
      throw new Error(
        `subset-fonts: font "${plan.name}" is ${bytes}B, over its ${plan.maxBytes}B ceiling`
      );
    }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
