import { describe, it, expect } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DISC_TOLERANCE_PX, TARGET_DISC_RATIO, measure } from '../logo-shape.mjs';

/**
 * One logo, every surface, two proportions — measured on the shipped assets, not
 * on the generators' intent.
 *
 * The **PWA's own icon set** carries the artwork's proportion (51.7% of the
 * tile): that is what the installed PWA's icon is drawn from.
 *
 * The **app's surfaces** carry `TARGET_DISC_RATIO` (64%), the middle the owner
 * picked after being shown the two extremes on the emulator — 76% with the
 * artwork drawn across the adaptive canvas, 52% inset to the 72dp safe zone. Each
 * surface reaches it its own way, because only the launcher transforms anything:
 * a launcher magnifies the adaptive canvas's visible centre (measured 1.47x on
 * the API 30 Pixel Launcher), so that one surface divides the magnification out
 * while the rest scale the artwork instead. Both extremes are one constant away,
 * and this test fails on a drift to either.
 *
 * The favicons are the third case, and deliberately so: the master circle-cropped
 * at 100%, a tab icon rather than an install surface, and the wider disc is the
 * readable one at 16–32px.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ICONS = join(ROOT, 'public', 'icons');
const RES = join(ROOT, 'android', 'app', 'src', 'main', 'res');

const PURPLE = { r: 120, g: 104, b: 234 };
/**
 * How much a launcher magnifies the adaptive canvas's visible centre when it
 * draws it, measured on the API 30 Pixel Launcher: the same artwork rendered
 * 1.47x larger than its canvas proportion.
 */
const LAUNCHER_MAGNIFICATION = 1.47;

/** The PWA's own icon set: the tiles the installed icon is drawn from. */
const iconFiles = readdirSync(ICONS)
  .filter((name) =>
    /^(icon-\d+x\d+|icon-maskable-\d+x\d+|apple-touch-icon-\d+x\d+)\.png$/.test(name)
  )
  .map((name) => join(ICONS, name));

/** The web-push notification's artwork, which carries the app's proportion. */
const notificationFile = join(
  ICONS,
  readdirSync(ICONS).find((name) => /^notification-icon-\d+x\d+\.png$/.test(name))
);

/**
 * The Android launcher layers, one directory per density.
 */
const launcherFiles = readdirSync(RES)
  .filter((name) => /^mipmap-(mdpi|hdpi|xhdpi|xxhdpi|xxxhdpi)$/.test(name))
  .flatMap((dir) =>
    ['ic_launcher.png', 'ic_launcher_round.png', 'ic_launcher_foreground.png'].map((file) =>
      join(RES, dir, file)
    )
  );

/** Every `drawable*` folder: where a stale splash bitmap would hide. */
const drawableDirs = readdirSync(RES).filter((name) => name.startsWith('drawable'));

/** The splash's logo drawable, which the layer-list centres. */
const splashLogoFile = join(RES, 'drawable-xxxhdpi', 'splash_logo.png');

/** The favicons: the master circle-cropped at 100%, disc and all. */
const faviconFiles = ['favicon-192x192.png', 'favicon-512x512.png'].map((name) =>
  join(ROOT, 'public', name)
);

const master = await measure(join(ICONS, 'icon-1024x1024.png'), PURPLE);
/** The PWA's own proportion: the artwork inset to 86% of the tile. */
const discProportion = master.disc / master.tile;
/**
 * The adaptive canvas's artwork share, derived from the same two numbers the
 * generator uses, so a change to the artwork keeps this in step.
 */
const ADAPTIVE_ARTWORK = TARGET_DISC_RATIO / (discProportion * LAUNCHER_MAGNIFICATION);
/** The artwork's own proportion, for the surfaces that are not the tile. */
const source = await measure(join(ROOT, 'public', 'logo.webp'), PURPLE);
const sourceProportion = source.disc / source.tile;

const shown = (file) => relative(ROOT, file).split('\\').join('/');

/**
 * The largest image inside `favicon.ico`, as a buffer, so the tab icon can be
 * measured like every other asset. A browser picks from the same set, and the
 * small entries are too coarse to measure (0.6 of 16px is 10px, ±1px = 10%).
 */
function largestIcoEntry(file) {
  const ico = readFileSync(file);
  const count = ico.readUInt16LE(4);
  let best;
  for (let i = 0; i < count; i++) {
    const entry = 6 + 16 * i;
    const size = ico[entry] === 0 ? 256 : ico[entry];
    if (best && size <= best.size) continue;
    const offset = ico.readUInt32LE(entry + 12);
    best = { size, data: ico.subarray(offset, offset + ico.readUInt32LE(entry + 8)) };
  }
  return best.data;
}

describe('the logo is one shape on every surface', () => {
  it('measures the reference proportion off the PWA icon', () => {
    expect(master.tile).toBe(master.image.width);
    expect(discProportion).toBeGreaterThan(0.5);
    expect(discProportion).toBeLessThan(0.53);
  });

  it('matches the PWA icon across the PWA icon set', async () => {
    const drifts = [];
    for (const file of iconFiles) {
      const { disc, tile, image } = await measure(file, PURPLE);
      if (tile !== image.width) {
        drifts.push(`${shown(file)}: the logo is ${tile}px wide in a ${image.width}px tile`);
      }
      if (Math.abs(disc - Math.round(discProportion * image.width)) > DISC_TOLERANCE_PX) {
        drifts.push(
          `${shown(file)}: the disc is ${disc}px wide, expected ` +
            `${Math.round(discProportion * image.width)}px ` +
            `(${(100 * discProportion).toFixed(1)}%, the artwork's own)`
        );
      }
    }
    expect(drifts).toEqual([]);
  });

  it("reads at the chosen proportion on the app's own surfaces", async () => {
    const files = [notificationFile, ...launcherFiles, splashLogoFile];
    const drifts = [];
    for (const file of files) {
      const { disc, tile, image } = await measure(file, PURPLE);
      const adaptive = file.endsWith('ic_launcher_foreground.png');
      // Only the adaptive canvas is magnified by the launcher, so only it divides
      // that out; everything else is drawn at the size it is authored at.
      const target = adaptive ? TARGET_DISC_RATIO / LAUNCHER_MAGNIFICATION : TARGET_DISC_RATIO;
      const expected = Math.round(target * image.width);
      if (Math.abs(disc - expected) > DISC_TOLERANCE_PX) {
        drifts.push(
          `${shown(file)}: the disc is ${disc}px of ${image.width}px, expected ${expected}px ` +
            `(${(100 * target).toFixed(1)}%)`
        );
      }
      // The artwork is drawn larger than these surfaces and cropped, except on the
      // adaptive canvas, where it is inset instead.
      const artBox = adaptive ? Math.round(image.width * ADAPTIVE_ARTWORK) : image.width;
      if (Math.abs(tile - artBox) > DISC_TOLERANCE_PX) {
        drifts.push(
          `${shown(file)}: the artwork is ${tile}px wide, expected ${artBox}px ` +
            `(${adaptive ? `${(100 * ADAPTIVE_ARTWORK).toFixed(1)}% of the canvas` : 'all of it'})`
        );
      }
    }
    expect(drifts).toEqual([]);
  });

  it('draws the splash as a centred dp-sized disc, never a stretched bitmap', async () => {
    // The plugin hands the drawable to `setBackground` on launch, so a bitmap is
    // stretched to fill and `androidScaleType` never applies — measured on the
    // API 30 emulator, a 1:2 frame came out 190x180px. The layer-list draws its
    // item by gravity and dp size instead, and `drawable/splash.xml` is also the
    // launch theme's starting-window background. The drawable's own proportion is
    // checked with the app's other surfaces, above.
    const drifts = [];
    for (const dir of drawableDirs) {
      const frame = join(RES, dir, 'splash.png');
      if (existsSync(frame)) {
        drifts.push(
          `${shown(frame)}: a bitmap frame — it would be stretched and would win ` +
            'resource selection over drawable/splash.xml'
        );
      }
    }

    const { image } = await measure(splashLogoFile, PURPLE);
    if (image.at(0, 0).a !== 0) {
      drifts.push(`${shown(splashLogoFile)}: corners must be transparent — it is a disc`);
    }

    // xxxhdpi: the logo is 4x its dp size, and the layer-list must place it at
    // exactly that, so the splash and the launcher icon agree on the disc.
    const xml = readFileSync(join(RES, 'drawable', 'splash.xml'), 'utf8');
    const dp = image.width / 4;
    for (const expected of [
      `android:width="${dp}dp"`,
      `android:height="${dp}dp"`,
      'android:gravity="center"',
      '@drawable/splash_logo',
    ]) {
      if (!xml.includes(expected)) drifts.push(`drawable/splash.xml: missing ${expected}`);
    }
    const colour = readFileSync(join(RES, 'values', 'splash_background.xml'), 'utf8');
    if (!colour.includes('#0f172a')) {
      drifts.push('values/splash_background.xml: must be the shell background #0f172a');
    }

    expect(drifts).toEqual([]);
  });

  it('crops the tile to a disc for the round icon', async () => {
    const squares = [];
    for (const file of launcherFiles.filter((name) => name.endsWith('ic_launcher_round.png'))) {
      const { image } = await measure(file, PURPLE);
      if (image.at(0, 0).a !== 0) squares.push(shown(file));
    }
    expect(squares).toEqual([]);
  });

  it('leaves the favicons on the master, for a legible 16px tab', async () => {
    // Deliberately not the tile's proportion: a favicon is a tab icon, not an
    // install surface, and the wider disc is the readable one at 16-32px. Pinned
    // so it can only change on purpose.
    const drifts = [];
    for (const file of [...faviconFiles, join(ROOT, 'public', 'favicon.ico')]) {
      const { disc, tile } = await measure(
        file.endsWith('.ico') ? largestIcoEntry(file) : file,
        PURPLE
      );
      if (Math.abs(disc - Math.round(sourceProportion * tile)) > DISC_TOLERANCE_PX) {
        drifts.push(
          `${shown(file)}: the disc is ${disc}px of ${tile}px, expected ` +
            `${Math.round(sourceProportion * tile)}px (the master's own ` +
            `${(100 * sourceProportion).toFixed(0)}%)`
        );
      }
    }
    expect(drifts).toEqual([]);
  });
});
