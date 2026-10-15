#!/usr/bin/env node
/**
 * Generates the Android launcher icon layers from the same artwork the PWA ships,
 * so the app and the installed PWA read as one product: one logo, one purple, one
 * proportion. `scripts/logo-shape.mjs` holds the measurements this file's
 * `validate()` step is written against.
 *
 * The splash is not generated here. It is the launch theme, drawing the launcher
 * icon itself, so there is no splash-specific asset to keep in step — see #212 and
 * `android/app/src/main/res/values/styles.xml`.
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
import {
  DISC_TOLERANCE_PX,
  TARGET_DISC_RATIO,
  artworkDiscRatio,
  artworkScaleFor,
  measure,
} from './logo-shape.mjs';

const BRAND_PURPLE = '#7868ea';
/**
 * The PWA's full-bleed tile, not its `any` icon: the maskable set is the artwork
 * inset into an opaque square, which is the layer every surface here is cut from.
 * The `any` set is circle-cropped for the desktop install UI (see
 * `scripts/generate-icons.mjs`), so cutting these from it would drop transparent
 * corners inside the adaptive canvas and the legacy launcher icon.
 */
const SOURCE = 'public/icons/icon-maskable-1024x1024.png';
const RES = 'android/app/src/main/res';

const DENSITIES = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
/** Legacy launcher icon size in dp. */
const LAUNCHER_DP = 48;
/**
 * Adaptive icon canvas in dp. The foreground is drawn across all of it, matching
 * the PWA's maskable icon byte-for-byte in construction; see `fullBleedTile`.
 */
const ADAPTIVE_DP = 108;
/**
 * How much a launcher magnifies the adaptive canvas's visible centre when it
 * draws it, measured on the API 30 Pixel Launcher: the same artwork rendered
 * 1.47x larger than its canvas proportion.
 */
const LAUNCHER_MAGNIFICATION = 1.47;
/**
 * The launch theme's icon, in dp — and the one surface whose proportion comes out
 * of geometry rather than out of a scale we pick.
 *
 * Both splash implementations draw the icon across an area and mask it down to a
 * circle two thirds of that area: `core-splashscreen`'s layer-list draws it at
 * 288dp and strokes the mask in to 192dp, and Android 12+ pairs the documented
 * 240dp area with a 160dp visible circle. So a drawable whose disc sits at
 * `SPLASH_ARTWORK_SCALE` (42.7%) of its own width reads `TARGET_DISC_RATIO` (64%)
 * of the circle a person sees: the launcher icon's proportion, at launch.
 *
 * 288dp rather than 240: it is the larger of the two areas, so the platform scales
 * it down rather than up whichever one it picks.
 */
const SPLASH_ICON_DP = 288;

function rgb(hex) {
  const value = hex.replace('#', '');
  return {
    r: parseInt(value.slice(0, 2), 16),
    g: parseInt(value.slice(2, 4), 16),
    b: parseInt(value.slice(4, 6), 16),
  };
}

const PURPLE = rgb(BRAND_PURPLE);

if (!fs.existsSync(SOURCE)) {
  console.error(`Missing ${SOURCE}. Run: node scripts/generate-icons.mjs`);
  process.exit(1);
}

/** The artwork's own disc proportion, measured off the shipped icon. */
const ARTWORK_RATIO = await artworkDiscRatio(SOURCE, PURPLE);
/**
 * The scales that reach `TARGET_DISC_RATIO`, per surface.
 *
 * A surface drawn at its own size — the legacy launcher icon, the round icon —
 * gets the artwork larger than its logo box, cropping purple to hit the target.
 * The two surfaces a platform magnifies are different: they divide that
 * magnification out instead. `LAUNCHER_MAGNIFICATION` is a launcher's own, as
 * measured on the API 30 Pixel Launcher; the splash's mask is exactly two thirds
 * of the area the icon is drawn in (288dp against 192dp, 240dp against 160dp), so
 * that one is geometry — 1.5 — rather than a measurement, and lands on the target
 * exactly. Every scale is one expression, so moving `TARGET_DISC_RATIO` moves all
 * of them together.
 */
const SURFACE_ARTWORK_SCALE = artworkScaleFor(ARTWORK_RATIO);
const ADAPTIVE_ARTWORK_SCALE = TARGET_DISC_RATIO / (ARTWORK_RATIO * LAUNCHER_MAGNIFICATION);
const SPLASH_MASK_RATIO = 3 / 2;
const SPLASH_ARTWORK_SCALE = TARGET_DISC_RATIO / (ARTWORK_RATIO * SPLASH_MASK_RATIO);

const tile = await sharp(SOURCE).metadata();
if (!tile.width || tile.width !== tile.height) {
  console.error(`${SOURCE} must be a square; got ${tile.width}x${tile.height}`);
  process.exit(1);
}

/**
 * A full-bleed square of the brand tile at `size` — the artwork the PWA ships,
 * The artwork is drawn larger than the icon and cropped, so the white disc lands
 * on `TARGET_DISC_RATIO` of the icon rather than on the artwork's own proportion.
 * Only the artwork's purple edges are lost, and purple is the background colour.
 */
async function fullBleedTile(size, file) {
  const art = Math.round(size * SURFACE_ARTWORK_SCALE);
  const inset = Math.round((art - size) / 2);
  await sharp(SOURCE)
    .resize(art, art, { fit: 'fill' })
    .extract({ left: inset, top: inset, width: size, height: size })
    .png()
    .toFile(file);
}

/**
 * The artwork centred at `scale` of a transparent `size` square. Two surfaces use
 * it: the adaptive foreground, across the 108dp canvas, and the launch theme's
 * icon at `SPLASH_ICON_DP`.
 */
async function artworkOnTransparency(size, scale, file) {
  const inner = Math.round(size * scale);
  const logo = await sharp(SOURCE).resize(inner, inner, { fit: 'fill' }).toBuffer();
  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { ...PURPLE, alpha: 0 },
    },
  })
    .composite([{ input: logo, gravity: 'center' }])
    .png()
    .toFile(file);
}

/**
 * The launch theme's icon: the artwork centred on transparency at
 * `SPLASH_ARTWORK_SCALE`, at `SPLASH_ICON_DP` — the same construction as the
 * adaptive foreground, one mask ratio apart, so the splash and the launcher icon
 * agree on the disc (see `SPLASH_ICON_DP`).
 */
async function writeSplashIcon(written) {
  const file = path.join(RES, 'drawable-xxxhdpi', 'splash_icon.png');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  await artworkOnTransparency(SPLASH_ICON_DP * 4, SPLASH_ARTWORK_SCALE, file);
  written.push(`${file} (${SPLASH_ICON_DP * 4}²)`);
}

/**
 * The artwork cut to an inscribed disc: transparent corners, for
 * `android:roundIcon`. Scaled first, so the white disc sits at
 * `TARGET_DISC_RATIO` of the purple disc rather than at the artwork's own share.
 */
async function discTile(size) {
  const art = Math.round(size * SURFACE_ARTWORK_SCALE);
  const inset = Math.round((art - size) / 2);
  const mask = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">` +
      `<circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#fff"/></svg>`
  );
  const logo = await sharp(SOURCE)
    .resize(art, art, { fit: 'fill' })
    .extract({ left: inset, top: inset, width: size, height: size })
    .toBuffer();
  return sharp(logo)
    .composite([{ input: mask, blend: 'dest-in' }])
    .png()
    .toBuffer();
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

/**
 * Every generated asset has to land on the proportion its surface is drawn at —
 * `TARGET_DISC_RATIO` where nothing magnifies the artwork, that same number
 * divided by the launcher's magnification inside the adaptive canvas. The
 * artwork's own share is checked too, because that is what moves when a scale is
 * left out: an asset that drifts fails the run instead of shipping as "close
 * enough".
 */
async function validate() {
  const where = (file) => path.relative(RES, file).split(path.sep).join('/');
  let errors = 0;

  /** The white disc, which is what a person reads as "the logo's size". */
  const expectDisc = async (file, box, target, label) => {
    if (!fs.existsSync(file)) {
      console.error(`  ✗ ${where(file)}: missing`);
      errors += 1;
      return;
    }
    const { disc } = await measure(file, PURPLE);
    const expected = Math.round(target * box);
    if (Math.abs(disc - expected) > DISC_TOLERANCE_PX) {
      console.error(
        `  ✗ ${where(file)}: disc ${disc}px wide, expected ${expected}px ` +
          `(${(100 * target).toFixed(1)}% of ${label})`
      );
      errors += 1;
    }
  };

  /** The artwork's share of the surface: 1 where it is cropped to fill, less where it is inset. */
  const expectArtwork = async (file, box, share) => {
    if (!fs.existsSync(file)) return;
    const { tile } = await measure(file, PURPLE);
    const expected = Math.round(share * box);
    if (Math.abs(tile - expected) > DISC_TOLERANCE_PX) {
      console.error(
        `  ✗ ${where(file)}: the artwork is ${tile}px wide, expected ${expected}px ` +
          `(${(100 * share).toFixed(1)}% of the ${box}px surface)`
      );
      errors += 1;
    }
  };

  for (const [density, scale] of Object.entries(DENSITIES)) {
    const dir = path.join(RES, `mipmap-${density}`);
    const icon = Math.round(LAUNCHER_DP * scale);
    const launcher = path.join(dir, 'ic_launcher.png');
    await expectDisc(launcher, icon, TARGET_DISC_RATIO, 'the icon');
    await expectArtwork(launcher, icon, 1);

    const round = path.join(dir, 'ic_launcher_round.png');
    await expectDisc(round, icon, TARGET_DISC_RATIO, 'the disc');
    await expectArtwork(round, icon, 1);
    if (fs.existsSync(round) && (await measure(round, PURPLE)).image.at(0, 0).a !== 0) {
      console.error(`  ✗ ${where(round)}: corners must be transparent — it is a disc`);
      errors += 1;
    }

    // The adaptive canvas is the one surface a launcher magnifies, so the artwork
    // is inset there and its disc reads smaller on the canvas than on the icon.
    const canvas = Math.round(ADAPTIVE_DP * scale);
    const foreground = path.join(dir, 'ic_launcher_foreground.png');
    await expectDisc(foreground, canvas, TARGET_DISC_RATIO / LAUNCHER_MAGNIFICATION, 'the canvas');
    await expectArtwork(foreground, canvas, ADAPTIVE_ARTWORK_SCALE);
  }

  // The launch theme's icon is generated above; nothing else splash-named may
  // exist. A layer-list, a frame bitmap or the plugin's colour file would be a
  // second splash again — and this one is the launcher's own construction, so it
  // cannot drift from the icon it mirrors.
  const splashIcon = path.join(RES, 'drawable-xxxhdpi', 'splash_icon.png');
  await expectDisc(
    splashIcon,
    SPLASH_ICON_DP * 4,
    TARGET_DISC_RATIO / SPLASH_MASK_RATIO,
    'the drawn area'
  );
  await expectArtwork(splashIcon, SPLASH_ICON_DP * 4, SPLASH_ARTWORK_SCALE);

  const allowed = new Set(['splash_icon.png']);
  for (const dir of fs.readdirSync(RES).filter((name) => name.startsWith('drawable'))) {
    for (const file of fs.readdirSync(path.join(RES, dir))) {
      if (!/^splash/i.test(file) || allowed.has(file)) continue;
      console.error(`  ✗ ${where(path.join(RES, dir, file))}: no splash asset may exist`);
      errors += 1;
    }
  }
  for (const name of fs.readdirSync(path.join(RES, 'values'))) {
    if (!/^splash/i.test(name)) continue;
    console.error(`  ✗ ${where(path.join(RES, 'values', name))}: no splash asset may exist`);
    errors += 1;
  }

  if (errors) {
    console.error(`\n${errors} error(s) — these assets no longer match the chosen proportions`);
    process.exit(1);
  }
  console.log(
    `  ✓ surfaces read at ${(100 * TARGET_DISC_RATIO).toFixed(1)}% of their shape ` +
      `(PWA artwork ${(100 * ARTWORK_RATIO).toFixed(1)}%, launcher magnification ` +
      `${LAUNCHER_MAGNIFICATION}x)`
  );
}

const written = [];

for (const [density, scale] of Object.entries(DENSITIES)) {
  const dir = path.join(RES, `mipmap-${density}`);
  fs.mkdirSync(dir, { recursive: true });

  const launcher = {
    file: path.join(dir, 'ic_launcher.png'),
    size: Math.round(LAUNCHER_DP * scale),
  };
  await fullBleedTile(launcher.size, launcher.file);
  written.push(`${launcher.file} (${launcher.size}²)`);

  const round = path.join(dir, 'ic_launcher_round.png');
  fs.writeFileSync(round, await discTile(launcher.size));
  written.push(`${round} (${launcher.size}²)`);

  const adaptive = {
    file: path.join(dir, 'ic_launcher_foreground.png'),
    size: Math.round(ADAPTIVE_DP * scale),
  };
  await artworkOnTransparency(adaptive.size, ADAPTIVE_ARTWORK_SCALE, adaptive.file);
  written.push(`${adaptive.file} (${adaptive.size}²)`);
}

written.push(writeBackgroundColour());

await writeSplashIcon(written);

console.log(`Generated ${written.length} Android resources in ${RES}:`);
for (const entry of written) console.log(`  ✓ ${entry}`);

console.log('\nValidating each surface against its target...');
await validate();
