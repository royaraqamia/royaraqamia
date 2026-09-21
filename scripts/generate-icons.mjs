import sharp from 'sharp';
import fs from 'fs';
import crypto from 'crypto';
import path from 'path';
import { execSync } from 'child_process';

const PURPLE = { r: 120, g: 104, b: 234 };
const OUT_DIR = 'public/icons';
const MASTER = 'public/logo.webp';

// Tile scale for every icon tile: the square logo is letterboxed (centered, same
// purple background) so the glyph sits comfortably inside Android's minimum
// maskable safe zone (a centered circle with a radius of 40% of the icon width).
const TILE_SCALE = 0.86;

// "any" icons: full-bleed purple tile carrying the same artwork as the maskable
// set. Desktop install UIs render these unmasked, so a border or inner circle
// baked into the file would make desktop read differently from mobile. Includes
// 192 and 512 so the manifest always exposes a large "any" icon (PWA installability),
// plus 1024 for high-DPI rendering, and keeps the favicon/service-worker paths resolving.
const ANY_SIZES = [72, 96, 128, 144, 152, 192, 384, 512, 1024];
// Apple-touch icons: same full-bleed purple tile, so iOS rounds it into the same
// squircle the Android launcher and desktop install UI show.
const APPLE_TOUCH_SIZES = [152, 167, 180];
// Maskable icons: full-bleed purple square (glyph inside the ~80% safe zone).
// Android's adaptive mask crops these into a clean circle.
const MASKABLE_SIZES = [192, 512, 1024];
const NOTIFICATION_SIZE = 192;
const BADGE_SIZE = 96;
// Badge mark occupies this fraction of the canvas. Android draws the badge from
// the alpha channel only, so the mark should fill most of the canvas; the system
// adds its own padding around it.
const BADGE_SCALE = 0.86;
// Tab favicons only ever need small raster sizes, so the .ico stays lean; the
// crisp HiDPI tab icon comes from the standalone favicon PNGs below.
const FAVICON_SIZES = [16, 32, 48];
// Standalone favicon PNGs. Circle-cropped to fully transparent corners (a purple
// disc) so the tab icon never paints a square behind it, light theme or dark.
const FAVICON_PNG_SIZES = [192, 512];

if (!fs.existsSync(MASTER)) {
  console.error(
    `Source logo not found at ${MASTER}. Place a square logo.webp there and run again.`
  );
  process.exit(1);
}

// Full-bleed tiles stay an opaque square (no border, no circle baked in) so
// Android's launcher mask and iOS's squircle can crop them into a clean shape,
// and desktop install UIs can render them as-is — all showing the same purple
// tile with the glyph safely inside the ~80% safe zone.
async function tileFullBleed(file, size) {
  const tile = Math.round(size * TILE_SCALE);
  const logo = await sharp(MASTER).resize(tile, tile, { fit: 'fill' }).toBuffer();
  await sharp({ create: { width: size, height: size, channels: 3, background: PURPLE } })
    .composite([{ input: logo, gravity: 'center' }])
    .png()
    .toFile(file);
}

async function generateNotificationIcon() {
  await sharp(MASTER)
    .resize(NOTIFICATION_SIZE, NOTIFICATION_SIZE, { fit: 'fill' })
    .png()
    .toFile(`${OUT_DIR}/notification-icon-${NOTIFICATION_SIZE}x${NOTIFICATION_SIZE}.png`);
}

// Badge: a white-on-transparent silhouette, because platforms that consume a
// badge/monochrome icon draw the alpha channel and tint it themselves. The mark
// itself (the diamond and dot enclosed by the logo's white disc) is lifted rather
// than the disc, since a disc silhouette collapses into a featureless blob at
// status-bar size while the mark stays readable.
async function generateBadge() {
  const { data, info } = await sharp(MASTER).raw().toBuffer({ resolveWithObject: true });
  const w = info.width;
  const c = info.channels;
  const isWhite = (i) =>
    data[i] > 180 && data[i + 1] > 180 && data[i + 2] > 180 && data[i + 3] > 128;

  // The white ring's bounding box is the disc that encloses the mark.
  let minx = w,
    miny = w,
    maxx = -1,
    maxy = -1;
  for (let y = 0; y < w; y++) {
    for (let x = 0; x < w; x++) {
      if (isWhite((y * w + x) * c)) {
        if (x < minx) minx = x;
        if (x > maxx) maxx = x;
        if (y < miny) miny = y;
        if (y > maxy) maxy = y;
      }
    }
  }
  const cx = (minx + maxx) / 2;
  const cy = (miny + maxy) / 2;
  // Inset the disc. Its rim is anti-aliased between the white ring and the purple
  // background, and those blended pixels are not white, so an un-inset circle would
  // take that rim itself for part of the mark. The mark sits well inside it.
  const r = (maxx - minx) / 2 - Math.max(2, Math.round((maxx - minx) * 0.015));

  // Mark = everything inside that disc that is not the white ring.
  const mark = Buffer.alloc(w * w * 4, 0);
  let mx0 = w,
    my0 = w,
    mx1 = -1,
    my1 = -1;
  for (let y = 0; y < w; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * c;
      if ((x - cx) ** 2 + (y - cy) ** 2 > r * r || isWhite(i)) continue;
      mark[i] = 255;
      mark[i + 1] = 255;
      mark[i + 2] = 255;
      mark[i + 3] = 255;
      if (x < mx0) mx0 = x;
      if (x > mx1) mx1 = x;
      if (y < my0) my0 = y;
      if (y > my1) my1 = y;
    }
  }

  const pad = Math.round((mx1 - mx0) * 0.04);
  const bx0 = Math.max(0, mx0 - pad),
    by0 = Math.max(0, my0 - pad);
  const bw = Math.min(w - bx0, mx1 - mx0 + pad * 2 + 1),
    bh = Math.min(w - by0, my1 - my0 + pad * 2 + 1);
  const raw = Buffer.alloc(bw * bh * 4, 0);
  for (let y = 0; y < bh; y++) {
    for (let x = 0; x < bw; x++) {
      const si = ((by0 + y) * w + (bx0 + x)) * c;
      const di = (y * bw + x) * 4;
      raw[di] = 255;
      raw[di + 1] = 255;
      raw[di + 2] = 255;
      raw[di + 3] = mark[si + 3];
    }
  }
  const target = Math.round(BADGE_SIZE * BADGE_SCALE);
  const glyph = await sharp(raw, { raw: { width: bw, height: bh, channels: 4 } })
    .resize(target, target, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  await sharp({
    create: {
      width: BADGE_SIZE,
      height: BADGE_SIZE,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: glyph, gravity: 'center' }])
    .png()
    .toFile(`${OUT_DIR}/badge-icon-${BADGE_SIZE}x${BADGE_SIZE}.png`);
}

function buildIco(pngs) {
  const count = pngs.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(count, 4);
  const dir = Buffer.alloc(16 * count);
  let offset = 6 + 16 * count;
  for (let i = 0; i < count; i++) {
    const { size, buf } = pngs[i];
    dir[i * 16] = size >= 256 ? 0 : size;
    dir[i * 16 + 1] = size >= 256 ? 0 : size;
    dir[i * 16 + 2] = 0;
    dir[i * 16 + 3] = 0;
    dir.writeUInt16LE(1, i * 16 + 4);
    dir.writeUInt16LE(32, i * 16 + 6);
    dir.writeUInt32LE(buf.length, i * 16 + 8);
    dir.writeUInt32LE(offset, i * 16 + 12);
    offset += buf.length;
  }
  return Buffer.concat([header, dir, ...pngs.map((p) => p.buf)]);
}

// Circle-cropped logo: a purple disc with fully transparent corners, so the tab
// icon sits cleanly on any backdrop (light or dark) with no square behind it.
async function circleCroppedPng(size) {
  const mask = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">` +
      `<circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#fff"/></svg>`
  );
  const logo = await sharp(MASTER).resize(size, size, { fit: 'fill' }).toBuffer();
  return sharp(logo)
    .composite([{ input: mask, blend: 'dest-in' }])
    .png()
    .toBuffer();
}

async function generateFavicon() {
  const pngs = [];
  for (const size of FAVICON_SIZES) {
    pngs.push({ size, buf: await circleCroppedPng(size) });
  }
  fs.writeFileSync('public/favicon.ico', buildIco(pngs));

  for (const size of FAVICON_PNG_SIZES) {
    fs.writeFileSync(`public/favicon-${size}x${size}.png`, await circleCroppedPng(size));
  }
}

const TRANSPARENT_PX = (p) => p.a === 0;
const PURPLE_PX = (p) =>
  Math.abs(p.r - PURPLE.r) < 15 && Math.abs(p.g - PURPLE.g) < 15 && Math.abs(p.b - PURPLE.b) < 15;

async function cornerPixels(fp, size) {
  const { data, info } = await sharp(fp).raw().toBuffer({ resolveWithObject: true });
  const c = info.channels;
  const px = (x, y) => {
    const i = (y * size + x) * c;
    return { r: data[i], g: data[i + 1], b: data[i + 2], a: c > 3 ? data[i + 3] : 255 };
  };
  return { TL: px(0, 0), TR: px(size - 1, 0), BL: px(0, size - 1), BR: px(size - 1, size - 1) };
}

async function validateTile(fp, size, predicate, label) {
  if (!fs.existsSync(fp)) {
    console.error(`  ✗ Missing: ${label} (${size}x${size})`);
    return 1;
  }
  const meta = await sharp(fp).metadata();
  if (meta.width !== size || meta.height !== size) {
    console.error(`  ✗ ${label}: dimensions ${meta.width}x${meta.height}`);
    return 1;
  }
  const corners = await cornerPixels(fp, size);
  let errors = 0;
  for (const [ck, p] of Object.entries(corners)) {
    if (!predicate(p)) {
      console.error(`  ✗ ${label}: ${ck} unexpected rgba(${p.r},${p.g},${p.b},${p.a})`);
      errors++;
    }
  }
  return errors;
}

async function validate() {
  let errors = 0;

  for (const size of ANY_SIZES) {
    errors += await validateTile(
      `${OUT_DIR}/icon-${size}x${size}.png`,
      size,
      PURPLE_PX,
      `icon-${size}x${size}`
    );
  }
  for (const size of MASKABLE_SIZES) {
    errors += await validateTile(
      `${OUT_DIR}/icon-maskable-${size}x${size}.png`,
      size,
      PURPLE_PX,
      `icon-maskable-${size}x${size} (maskable)`
    );
  }
  for (const size of APPLE_TOUCH_SIZES) {
    errors += await validateTile(
      `${OUT_DIR}/apple-touch-icon-${size}x${size}.png`,
      size,
      PURPLE_PX,
      `apple-touch-icon-${size}x${size}`
    );
  }

  const notifFp = `${OUT_DIR}/notification-icon-${NOTIFICATION_SIZE}x${NOTIFICATION_SIZE}.png`;
  if (!fs.existsSync(notifFp)) {
    console.error(`  ✗ Missing: notification icon`);
    errors++;
  } else {
    const meta = await sharp(notifFp).metadata();
    if (meta.width !== NOTIFICATION_SIZE) {
      console.error(`  ✗ notification icon: wrong size`);
      errors++;
    } else {
      const corners = await cornerPixels(notifFp, NOTIFICATION_SIZE);
      if (!corners.TL.r || !corners.TL.a) {
        console.error(`  ✗ notification icon: must be the opaque full-bleed logo`);
        errors++;
      }
    }
  }

  const badgeFp = `${OUT_DIR}/badge-icon-${BADGE_SIZE}x${BADGE_SIZE}.png`;
  if (!fs.existsSync(badgeFp)) {
    console.error(`  ✗ Missing: badge icon`);
    errors++;
  } else {
    const { data, info } = await sharp(badgeFp).raw().toBuffer({ resolveWithObject: true });
    const c = info.channels;
    const corners = await cornerPixels(badgeFp, BADGE_SIZE);
    let opaque = 0,
      bx0 = BADGE_SIZE,
      by0 = BADGE_SIZE,
      bx1 = -1,
      by1 = -1;
    for (let y = 0; y < BADGE_SIZE; y++) {
      for (let x = 0; x < BADGE_SIZE; x++) {
        if (data[(y * BADGE_SIZE + x) * c + 3] > 32) {
          opaque++;
          if (x < bx0) bx0 = x;
          if (x > bx1) bx1 = x;
          if (y < by0) by0 = y;
          if (y > by1) by1 = y;
        }
      }
    }
    const fill = Math.max(bx1 - bx0 + 1, by1 - by0 + 1) / BADGE_SIZE;
    const cornersOpaque = Object.values(corners).some((p) => p.a !== 0);
    if (cornersOpaque || opaque === 0 || fill < 0.7 || opaque > BADGE_SIZE * BADGE_SIZE * 0.6) {
      console.error(
        `  ✗ badge: must be a transparent-cornered mark filling ≥70% of the canvas ` +
          `(fill ${(fill * 100).toFixed(0)}%, opaque ${opaque}px)`
      );
      errors++;
    }
  }

  const icoFp = 'public/favicon.ico';
  if (!fs.existsSync(icoFp)) {
    console.error('  ✗ Missing: favicon.ico');
    errors++;
  } else {
    const ico = fs.readFileSync(icoFp);
    const count = ico.readUInt16LE(4);
    for (let i = 0; i < count; i++) {
      const o = 6 + 16 * i;
      const size = ico[o] === 0 ? 256 : ico[o];
      const len = ico.readUInt32LE(o + 8);
      const off = ico.readUInt32LE(o + 12);
      const corners = await cornerPixels(ico.subarray(off, off + len), size);
      for (const [ck, p] of Object.entries(corners)) {
        if (p.a !== 0) {
          console.error(`  ✗ favicon.ico ${size}x${size}: ${ck} must be transparent`);
          errors++;
        }
      }
    }
  }

  for (const size of FAVICON_PNG_SIZES) {
    const fp = `public/favicon-${size}x${size}.png`;
    errors += await validateTile(fp, size, TRANSPARENT_PX, `favicon-${size}x${size}`);
    if (fs.existsSync(fp)) {
      const { data, info } = await sharp(fp).raw().toBuffer({ resolveWithObject: true });
      const centerAlpha = data[((size / 2) * size + size / 2) * info.channels + info.channels - 1];
      if (centerAlpha !== 255) {
        console.error(`  ✗ favicon-${size}x${size}: center must be opaque`);
        errors++;
      }
    }
  }

  return errors;
}

// Every asset whose URL is handed out to browsers. The set is hashed into a
// version token that is appended to each URL as `?v=<hash>`, so a change to any
// file publishes a brand-new URL. Old URLs keep serving the bytes a client
// already cached; new URLs can never be answered from a stale HTTP/PWA/favicon
// cache — no "clear site data" required to see the new artwork.
function assetFingerprintFiles() {
  return [
    ...ANY_SIZES.map((s) => `${OUT_DIR}/icon-${s}x${s}.png`),
    ...MASKABLE_SIZES.map((s) => `${OUT_DIR}/icon-maskable-${s}x${s}.png`),
    ...APPLE_TOUCH_SIZES.map((s) => `${OUT_DIR}/apple-touch-icon-${s}x${s}.png`),
    `${OUT_DIR}/notification-icon-${NOTIFICATION_SIZE}x${NOTIFICATION_SIZE}.png`,
    `${OUT_DIR}/badge-icon-${BADGE_SIZE}x${BADGE_SIZE}.png`,
    'public/favicon.ico',
    ...FAVICON_PNG_SIZES.map((s) => `public/favicon-${s}x${s}.png`),
  ];
}

function computeAssetVersion() {
  const hash = crypto.createHash('sha256');
  for (const file of assetFingerprintFiles()) {
    // Fold the path in too, so a rename/addition changes the token even if the
    // concatenated bytes happen to collide.
    hash.update(file);
    hash.update(fs.readFileSync(file));
  }
  return hash.digest('hex').slice(0, 10);
}

// The manifest is generated rather than hand-maintained so its icon `src`
// values always carry the current asset version. A browser holding an installed
// app re-reads the manifest (its `<link>` is versioned too), sees unfamiliar
// icon URLs, and fetches the new artwork instead of reusing cached bytes.
function generateManifest(assetVersion) {
  const v = `?v=${assetVersion}`;
  const manifest = {
    name: 'رؤيَة رقَميَّة',
    short_name: 'رؤيَة رقَميَّة',
    description:
      'نبني منتجات رقميَّة برؤية رياديَّة، تنفع النَّاس وتمكث في الأرض؛ كما نُقدِّم للطُّلاب والخرِّيجين الجدد تدريبًا احترافيًّا متكاملًا لبناء التَّطبيقات.',
    start_url: '/',
    id: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#0f172a',
    theme_color: '#0f172a',
    lang: 'ar',
    dir: 'rtl',
    categories: ['education', 'technology', 'business'],
    icons: [
      ...ANY_SIZES.map((s) => ({
        src: `${OUT_DIR.replace(/^public/, '')}/icon-${s}x${s}.png${v}`,
        sizes: `${s}x${s}`,
        type: 'image/png',
        purpose: 'any',
      })),
      ...MASKABLE_SIZES.map((s) => ({
        src: `${OUT_DIR.replace(/^public/, '')}/icon-maskable-${s}x${s}.png${v}`,
        sizes: `${s}x${s}`,
        type: 'image/png',
        purpose: 'maskable',
      })),
      {
        src: `${OUT_DIR.replace(/^public/, '')}/badge-icon-${BADGE_SIZE}x${BADGE_SIZE}.png${v}`,
        sizes: `${BADGE_SIZE}x${BADGE_SIZE}`,
        type: 'image/png',
        purpose: 'monochrome',
      },
    ],
  };
  fs.writeFileSync('public/manifest.json', `${JSON.stringify(manifest, null, 2)}\n`);
}

// Server components need the same token the manifest and service worker use, so
// the generated metadata is the single source of truth for the asset version.
function generateAssetVersionModule(assetVersion) {
  const output = 'backend/config/generated/asset-version.ts';
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(
    output,
    '// Auto-generated by scripts/generate-icons.mjs — do not edit by hand.\n' +
      '// Content hash of the generated PWA/favicon assets. Appended to icon,\n' +
      '// favicon and manifest URLs so a change always busts client caches.\n' +
      `export const ASSET_VERSION = '${assetVersion}';\n`
  );
  console.log(`  ✓ asset-version.ts → ${assetVersion}`);
}

function generateSwVersion(assetVersion) {
  const version =
    process.env.VERCEL_DEPLOYMENT_ID ||
    process.env.VERCEL_GIT_COMMIT_SHA ||
    execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim() ||
    'dev';
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  const cache = `royaraqamia-v${pkg.version}-${version}`;
  fs.writeFileSync(
    'public/sw-version.js',
    `self.CACHE_VERSION = '${cache}';\n` + `self.ASSET_VERSION = '${assetVersion}';\n`
  );
  console.log(`  ✓ sw-version.js → ${cache} (assets ${assetVersion})`);
}

async function main() {
  console.log('Generating icons...');
  for (const size of ANY_SIZES) {
    await tileFullBleed(`${OUT_DIR}/icon-${size}x${size}.png`, size);
    console.log(`  ✓ icon-${size}x${size} (full-bleed purple tile)`);
  }
  for (const size of MASKABLE_SIZES) {
    await tileFullBleed(`${OUT_DIR}/icon-maskable-${size}x${size}.png`, size);
    console.log(`  ✓ icon-maskable-${size}x${size} (maskable, full-bleed)`);
  }
  for (const size of APPLE_TOUCH_SIZES) {
    await tileFullBleed(`${OUT_DIR}/apple-touch-icon-${size}x${size}.png`, size);
    console.log(`  ✓ apple-touch-icon-${size}x${size} (full-bleed purple tile)`);
  }
  await generateNotificationIcon();
  console.log(`  ✓ notification-icon-${NOTIFICATION_SIZE}x${NOTIFICATION_SIZE}`);
  await generateBadge();
  console.log(`  ✓ badge-icon-${BADGE_SIZE}x${BADGE_SIZE}`);
  await generateFavicon();
  console.log('  ✓ favicon.ico');
  console.log(`  ✓ ${FAVICON_PNG_SIZES.map((s) => `favicon-${s}x${s}.png`).join(', ')}`);

  console.log('\nValidating...');
  const errors = await validate();
  if (errors) {
    console.error(`\n${errors} error(s) — fix and rerun`);
    process.exit(1);
  }
  console.log('  All icons validated ✓');

  console.log('\nGenerating asset version...');
  const assetVersion = computeAssetVersion();
  generateManifest(assetVersion);
  console.log(`  ✓ manifest.json → ?v=${assetVersion}`);
  generateAssetVersionModule(assetVersion);
  generateSwVersion(assetVersion);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
