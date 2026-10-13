#!/usr/bin/env node
/**
 * Generates the Android launcher icon and splash drawables from the same artwork
 * the PWA ships, so the app and the installed PWA read as one product.
 *
 * Hand-written rather than delegated to `@capacitor/assets`: that package pulls a
 * transitive `tar` with a critical advisory, and
 * `.github/workflows/security-scan.yml` runs `npm audit --audit-level=high`
 * across devDependencies as well — one image-generation convenience is not worth
 * failing that gate. `sharp` is already a pinned dependency.
 *
 * Usage: node scripts/generate-android-assets.mjs   (after `npm run icons`)
 */
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const BRAND_PURPLE = '#7868ea';
const SHELL_BACKGROUND = '#0f172a';
const SOURCE = 'public/icons/icon-1024x1024.png';
const RES = 'android/app/src/main/res';

const DENSITIES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
/** Legacy launcher icon size in dp. */
const LAUNCHER_DP = 48;
/** Adaptive icon canvas in dp, and the part of it a launcher mask is guaranteed to show. */
const ADAPTIVE_DP = 108;
const ADAPTIVE_VISIBLE_DP = 72;
/** The logo occupies this fraction of the shorter splash edge. */
const SPLASH_LOGO_SCALE = 0.3;

/** Mirrors the sizes Capacitor's template ships, so nothing else has to change. */
const SPLASH_SIZES = {
  drawable: [480, 320],
  'drawable-land-mdpi': [480, 320],
  'drawable-land-hdpi': [800, 480],
  'drawable-land-xhdpi': [1280, 720],
  'drawable-land-xxhdpi': [1600, 960],
  'drawable-land-xxxhdpi': [1920, 1280],
  'drawable-port-mdpi': [320, 480],
  'drawable-port-hdpi': [480, 800],
  'drawable-port-xhdpi': [720, 1280],
  'drawable-port-xxhdpi': [960, 1600],
  'drawable-port-xxxhdpi': [1280, 1920],
};

function rgb(hex) {
  const value = hex.replace('#', '');
  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16),
  };
}

if (!fs.existsSync(SOURCE)) {
  console.error(`Missing ${SOURCE}. Run: node scripts/generate-icons.mjs`);
  process.exit(1);
}

const tile = await sharp(SOURCE).metadata();
if (!tile.width || tile.width !== tile.height) {
  console.error(`${SOURCE} must be a square; got ${tile.width}x${tile.height}`);
  process.exit(1);
}

/** A full-bleed square of the brand tile: what a launcher shows unmasked. */
async function launcherIcon(size, file) {
  await sharp(SOURCE).resize(size, size, { fit: 'fill' }).png().toFile(file);
}

/** The same tile cut to a disc, for `android:roundIcon`. */
async function roundIcon(size, file) {
  const mask = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">` +
      `<circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#fff"/></svg>`
  );
  const logo = await sharp(SOURCE).resize(size, size, { fit: 'fill' }).toBuffer();
  await sharp(logo)
    .composite([{ input: mask, blend: 'dest-in' }])
    .png()
    .toFile(file);
}

/**
 * Adaptive foreground: the tile inside the guaranteed-visible centre of the
 * 108dp canvas, on transparency. The adaptive background is the same purple, so
 * the tile's own edges disappear into it and whichever mask the launcher applies
 * (circle, squircle, rounded square) crops purple rather than artwork.
 */
async function adaptiveForeground(size, file) {
  const inner = Math.round((size * ADAPTIVE_VISIBLE_DP) / ADAPTIVE_DP);
  const logo = await sharp(SOURCE).resize(inner, inner, { fit: 'fill' }).toBuffer();
  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { ...rgb(BRAND_PURPLE), alpha: 0 },
    },
  })
    .composite([{ input: logo, gravity: 'center' }])
    .png()
    .toFile(file);
}

async function splash(width, height, file) {
  const logoSize = Math.round(Math.min(width, height) * SPLASH_LOGO_SCALE);
  const logo = await sharp(SOURCE).resize(logoSize, logoSize, { fit: 'fill' }).toBuffer();
  await sharp({ create: { width, height, channels: 3, background: rgb(SHELL_BACKGROUND) } })
    .composite([{ input: logo, gravity: 'center' }])
    .png()
    .toFile(file);
}

function writeBackgroundColour() {
  const file = path.join(RES, 'values', 'ic_launcher_background.xml');
  fs.writeFileSync(
    file,
    '<?xml version="1.0" encoding="utf-8"?>\n' +
      '<resources>\n' +
      `    <color name="ic_launcher_background">${BRAND_PURPLE}</color>\n` +
      '</resources>\n'
  );
  return file;
}

const written = [];

for (const [density, scale] of Object.entries(DENSITIES)) {
  const dir = path.join(RES, `mipmap-${density}`);
  fs.mkdirSync(dir, { recursive: true });

  const launcher = {
    file: path.join(dir, 'ic_launcher.png'),
    size: Math.round(LAUNCHER_DP * scale),
  };
  await launcherIcon(launcher.size, launcher.file);
  written.push(`${launcher.file} (${launcher.size}²)`);

  const round = path.join(dir, 'ic_launcher_round.png');
  await roundIcon(launcher.size, round);
  written.push(`${round} (${launcher.size}²)`);

  const adaptive = {
    file: path.join(dir, 'ic_launcher_foreground.png'),
    size: Math.round(ADAPTIVE_DP * scale),
  };
  await adaptiveForeground(adaptive.size, adaptive.file);
  written.push(`${adaptive.file} (${adaptive.size}²)`);
}

for (const [dirName, [width, height]] of Object.entries(SPLASH_SIZES)) {
  const dir = path.join(RES, dirName);
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'splash.png');
  await splash(width, height, file);
  written.push(`${file} (${width}x${height})`);
}

written.push(writeBackgroundColour());

console.log(`Generated ${written.length} Android resources in ${RES}:`);
for (const entry of written) console.log(`  ✓ ${entry}`);
