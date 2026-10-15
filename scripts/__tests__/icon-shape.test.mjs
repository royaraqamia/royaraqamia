import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
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
 *
 * Shape is the other axis, and it follows the same question — *who draws the
 * file*. A surface that draws it as it is gets the logo's own shape: the `any`
 * set and the favicons are discs with transparent corners, which is what a desktop
 * install UI and a browser tab render. A surface that crops it gets a full-bleed
 * square and is shaped by the crop: the maskable set (a launcher's mask) and
 * `apple-touch-icon` (iOS's squircle). A square handed to an unmasked surface is a
 * purple sticker; a disc handed to a mask only loses its corners twice.
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

/** The favicons: the master circle-cropped at 100%, disc and all. */
const faviconFiles = ['favicon-192x192.png', 'favicon-512x512.png'].map((name) =>
  join(ROOT, 'public', name)
);

const master = await measure(join(ICONS, 'icon-maskable-1024x1024.png'), PURPLE);
/**
 * The PWA's own proportion: the artwork inset to 86% of the tile. Measured off the
 * maskable icon because that is the full-bleed square the inset describes — the
 * `any` set is the same tile circle-cropped, so it carries the same disc but is a
 * disc rather than a tile to measure it against.
 */
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
 * The 16px tab icon's disc, as a share of its canvas: the master's own proportion
 * drawn 1.3x larger, because the mark inside the disc does not survive 16px at
 * 60%. Pinned like `LAUNCHER_MAGNIFICATION`, so it can only change on purpose.
 */
const FAVICON_SMALL_SIZE = 16;
const FAVICON_SMALL_RATIO = 0.78;
/**
 * The 16px entry is measured at ±1px, not ±`DISC_TOLERANCE_PX`: at that size the
 * two proportions this check exists to tell apart — the master's 60% and the
 * scaled-up 78% — are 10px and 12px, so a 2px tolerance would accept either.
 */
const FAVICON_SMALL_TOLERANCE_PX = 1;

/**
 * Every image inside `favicon.ico`, as buffers, so the tab icon can be measured
 * like every other asset.
 */
function icoEntries(file) {
  const ico = readFileSync(file);
  const count = ico.readUInt16LE(4);
  const entries = [];
  for (let i = 0; i < count; i++) {
    const entry = 6 + 16 * i;
    const size = ico[entry] === 0 ? 256 : ico[entry];
    const offset = ico.readUInt32LE(entry + 12);
    entries.push({ size, data: ico.subarray(offset, offset + ico.readUInt32LE(entry + 8)) });
  }
  return entries;
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
    const files = [notificationFile, ...launcherFiles];
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

  it('crops the notification icon to a disc, like the round launcher icon', async () => {
    // The shade draws this on the notification's own surface, so transparent
    // corners are what makes it read as the logo rather than as a purple sticker
    // pasted on the card. Its proportion is checked with the other app surfaces.
    const { image } = await measure(notificationFile, PURPLE);
    expect(image.at(0, 0).a).toBe(0);
  });

  it('draws the splash from the launch theme, from the launcher artwork', async () => {
    // #212: the platform splash on Android 12+ and `core-splashscreen` below it
    // both read `AppTheme.NoActionBarLaunch`, and both draw the icon that theme
    // names — so any other splash resource would be a second splash, and a plugin
    // duration would be a second, unsynchronised dismissal.
    const drifts = [];

    // The theme's icon is the one splash-named resource allowed to exist.
    for (const name of readdirSync(RES, { recursive: true }).map(String)) {
      if (!/(^|[\\/])splash/i.test(name) || /splash_icon\.png$/.test(name)) continue;
      drifts.push(`${shown(join(RES, name))}: no other splash resource may exist`);
    }

    const styles = readFileSync(join(RES, 'values', 'styles.xml'), 'utf8');
    const launch = /<style name="AppTheme\.NoActionBarLaunch"[^>]*>([\s\S]*?)<\/style>/.exec(
      styles
    );
    if (!launch) {
      drifts.push('values/styles.xml: no AppTheme.NoActionBarLaunch theme');
    } else {
      if (!/parent="Theme\.SplashScreen"/.test(launch[0])) {
        drifts.push('AppTheme.NoActionBarLaunch: parent must be Theme.SplashScreen');
      }
      for (const item of [
        '<item name="windowSplashScreenBackground">#0f172a</item>',
        '<item name="windowSplashScreenAnimatedIcon">@drawable/splash_icon</item>',
        '<item name="postSplashScreenTheme">@style/AppTheme.NoActionBar</item>',
      ]) {
        if (!launch[1].includes(item)) drifts.push(`AppTheme.NoActionBarLaunch: missing ${item}`);
      }
    }

    // Both implementations draw the icon across an area and mask it down to a
    // circle two thirds of that area (288dp against 192dp, 240dp against 160dp),
    // which is the launcher's own magnification — so a disc at
    // `TARGET_DISC_RATIO / 1.5` of the asset reads `TARGET_DISC_RATIO` of the
    // circle a person sees. That is why the icon is not the launcher icon itself,
    // which the platform magnifies twice over.
    const iconFile = join(RES, 'drawable-xxxhdpi', 'splash_icon.png');
    const { disc, image } = await measure(iconFile, PURPLE);
    const visible = (image.width * 2) / 3;
    const expected = Math.round(TARGET_DISC_RATIO * visible);
    if (Math.abs(disc - expected) > DISC_TOLERANCE_PX) {
      drifts.push(
        `drawable-xxxhdpi/splash_icon.png: the disc is ${disc}px, expected ${expected}px — ` +
          `${((100 * disc) / visible).toFixed(0)}% of the ${Math.round(visible)}px circle ` +
          'the mask leaves'
      );
    }
    if (image.at(0, 0).a !== 0) {
      drifts.push('drawable-xxxhdpi/splash_icon.png: corners must be transparent');
    }

    const manifest = readFileSync(
      join(ROOT, 'android', 'app', 'src', 'main', 'AndroidManifest.xml'),
      'utf8'
    );
    if (!manifest.includes('android:theme="@style/AppTheme.NoActionBarLaunch"')) {
      drifts.push('AndroidManifest.xml: MainActivity must launch with AppTheme.NoActionBarLaunch');
    }

    // Below API 31 the theme is read by the compat library, which the activity has
    // to install before `super.onCreate` replaces the starting window.
    const activity = readFileSync(
      join(
        ROOT,
        'android',
        'app',
        'src',
        'main',
        'java',
        'com',
        'royaraqamia',
        'app',
        'MainActivity.java'
      ),
      'utf8'
    );
    const installed = activity.indexOf('SplashScreen.installSplashScreen(this);');
    const created = activity.indexOf('super.onCreate(savedInstanceState);');
    if (installed < 0 || created < 0 || installed > created) {
      drifts.push('MainActivity: installSplashScreen() must run before super.onCreate()');
    }

    // The plugin and its fixed `launchShowDuration` are what #212 retires; any of
    // these coming back restores the second splash.
    for (const [file, needle] of [
      ['capacitor.config.ts', 'SplashScreen'],
      ['capacitor.config.ts', 'launchShowDuration'],
      ['package.json', '@capacitor/splash-screen'],
      ['android/capacitor.settings.gradle', 'capacitor-splash-screen'],
      ['android/app/capacitor.build.gradle', 'capacitor-splash-screen'],
    ]) {
      if (readFileSync(join(ROOT, file), 'utf8').includes(needle)) {
        drifts.push(`${file}: still references ${needle}`);
      }
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

  it('keeps the favicons on the master, with the 16px entry scaled up to read', async () => {
    // Deliberately not the tile's proportion: a favicon is a tab icon, not an
    // install surface, and the wider disc is the readable one at 16-32px. The 16px
    // entry is the exception — the one size where the master's proportion leaves the
    // mark inside the disc under a pixel of stroke — and it is the only one. Pinned
    // so either can only change on purpose.
    const drifts = [];
    for (const file of [...faviconFiles, join(ROOT, 'public', 'favicon.ico')]) {
      const entries = file.endsWith('.ico')
        ? icoEntries(file)
        : [{ size: Number(/(\d+)x\d+\.png$/.exec(file)[1]), data: file }];
      for (const { size, data } of entries) {
        const { disc } = await measure(data, PURPLE);
        const small = size === FAVICON_SMALL_SIZE;
        const ratio = small ? FAVICON_SMALL_RATIO : sourceProportion;
        // The canvas, not the measured purple run: at 16px the rim is two
        // anti-aliased pixels wide, so what it measures is not the box the disc
        // sits in — the entry's own size is.
        const expected = Math.round(ratio * size);
        const tolerance = small ? FAVICON_SMALL_TOLERANCE_PX : DISC_TOLERANCE_PX;
        if (Math.abs(disc - expected) > tolerance) {
          drifts.push(
            `${shown(file)} ${size}x${size}: the disc is ${disc}px of ${size}px, expected ` +
              `${expected}px (${(100 * ratio).toFixed(0)}% of the canvas)`
          );
        }
      }
    }
    expect(drifts).toEqual([]);
  });

  it('shapes each icon set by the surface that draws it', async () => {
    // A desktop install UI draws the `any` icon as it is, so the file has to carry
    // the logo's own shape; a launcher's mask and iOS's squircle are what shape the
    // maskable and apple-touch sets, so those stay full-bleed squares on disk.
    const drifts = [];
    for (const name of readdirSync(ICONS)) {
      const any = /^icon-\d+x\d+\.png$/.test(name);
      const masked = /^(icon-maskable-\d+x\d+|apple-touch-icon-\d+x\d+)\.png$/.test(name);
      if (!any && !masked) continue;
      const alpha = (await measure(join(ICONS, name), PURPLE)).image.at(0, 0).a;
      if (any && alpha !== 0) {
        drifts.push(
          `icons/${name}: a desktop install draws this file as it is, so its corners must ` +
            `be transparent (corner alpha ${alpha})`
        );
      }
      if (masked && alpha !== 255) {
        drifts.push(
          `icons/${name}: a mask is what shapes this one, so it must stay full-bleed ` +
            `(corner alpha ${alpha}, expected 255)`
        );
      }
    }
    expect(drifts).toEqual([]);
  });
});
