import sharp from 'sharp';
import fs from 'fs';
import { execSync } from 'child_process';

const NAVY = { r: 15, g: 23, b: 42 };
const PURPLE = { r: 120, g: 104, b: 234 };
const OUT_DIR = 'public/icons';
const MASTER = 'public/logo.webp';

// Circle diameter (logo tile) as a fraction of the icon canvas for the "any"
// and apple-touch icons. These are circle-cropped to transparent corners so
// they read as a clean purple circle centered on a navy tile.
const RATIOS = {
  any: 0.78,
  appleTouch: 0.8,
};

// Maskable tile scale: the whole square logo is letterboxed (centered, same
// purple background) so the glyph sits comfortably inside Android's minimum
// safe zone (a centered circle with a radius of 40% of the icon width).
const MASKABLE_TILE = 0.86;

// "any" / apple-touch icons: circle-cropped purple logo on a navy tile. Includes
// 192 and 512 so the manifest always exposes a large "any" icon (PWA installability),
// plus 1024 for high-DPI rendering, and keeps the favicon/service-worker paths resolving.
const ANY_SIZES = [72, 96, 128, 144, 152, 192, 384, 512, 1024];
const APPLE_TOUCH_SIZES = [152, 167, 180];
// Maskable icons: full-bleed purple square (glyph inside the ~80% safe zone).
// Android's adaptive mask crops these into a clean circle.
const MASKABLE_SIZES = [192, 512, 1024];
const NOTIFICATION_SIZE = 192;
const BADGE_SIZE = 96;
// Badge glyph occupies this fraction of the canvas so Android can downscale it
// into a clean status-bar silhouette without the glyph reading as a solid block.
const BADGE_SCALE = 0.62;
const FAVICON_SIZES = [16, 32, 48, 256];

if (!fs.existsSync(MASTER)) {
  console.error(
    `Source logo not found at ${MASTER}. Place a square logo.webp there and run again.`
  );
  process.exit(1);
}

// Resize the master on a square canvas, then punch a circular alpha mask so the
// corners become transparent and only a perfect circle of the logo remains.
async function circleCroppedLogo(logoSize) {
  const logo = await sharp(MASTER).resize(logoSize, logoSize, { fit: 'fill' }).toBuffer();
  const mask = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${logoSize}" height="${logoSize}">` +
      `<circle cx="${logoSize / 2}" cy="${logoSize / 2}" r="${logoSize / 2}" fill="#fff"/></svg>`
  );
  return sharp(logo)
    .composite([{ input: mask, blend: 'dest-in' }])
    .png()
    .toBuffer();
}

async function tileOnNavy(file, size, ratio) {
  const logoSize = Math.round(size * ratio);
  const logo = await circleCroppedLogo(logoSize);
  await sharp({ create: { width: size, height: size, channels: 3, background: NAVY } })
    .composite([{ input: logo, gravity: 'center' }])
    .png()
    .toFile(file);
}

// Maskable icons stay a full-bleed opaque square (no navy border, no circle in
// the file) so Android's launcher mask does the cropping and shows a clean
// circle with the glyph safely inside the ~80% safe zone.
async function tileMaskable(file, size) {
  const tile = Math.round(size * MASKABLE_TILE);
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

async function generateBadge() {
  const { data, info } = await sharp(MASTER).raw().toBuffer({ resolveWithObject: true });
  const w = info.width;
  const isGlyph = (i) =>
    data[i] > 180 && data[i + 1] > 180 && data[i + 2] > 180 && data[i + 3] > 128;

  let minx = w,
    miny = w,
    maxx = -1,
    maxy = -1;
  for (let y = 0; y < w; y++) {
    for (let x = 0; x < w; x++) {
      if (isGlyph((y * w + x) * 4)) {
        if (x < minx) minx = x;
        if (x > maxx) maxx = x;
        if (y < miny) miny = y;
        if (y > maxy) maxy = y;
      }
    }
  }

  const pad = Math.round((maxx - minx) * 0.08);
  const bx0 = Math.max(0, minx - pad),
    by0 = Math.max(0, miny - pad);
  const bw = Math.min(w - bx0, maxx - minx + pad * 2),
    bh = Math.min(w - by0, maxy - miny + pad * 2);
  const raw = Buffer.alloc(bw * bh * 4);
  for (let y = 0; y < bh; y++) {
    for (let x = 0; x < bw; x++) {
      const si = ((by0 + y) * w + (bx0 + x)) * 4;
      const di = (y * bw + x) * 4;
      raw[di] = 255;
      raw[di + 1] = 255;
      raw[di + 2] = 255;
      raw[di + 3] = isGlyph(si) ? 255 : 0;
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

async function generateFavicon() {
  const pngs = [];
  for (const size of FAVICON_SIZES) {
    const circleMask = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">` +
        `<circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#fff"/></svg>`
    );
    const logo = await sharp(MASTER).resize(size, size, { fit: 'fill' }).toBuffer();
    const buf = await sharp(logo)
      .composite([{ input: circleMask, blend: 'dest-in' }])
      .png()
      .toBuffer();
    pngs.push({ size, buf });
  }
  fs.writeFileSync('public/favicon.ico', buildIco(pngs));
}

const NAVY_PX = (p) => p.r === NAVY.r && p.g === NAVY.g && p.b === NAVY.b && p.a === 255;
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
      NAVY_PX,
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
      NAVY_PX,
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
    const tl = data[3],
      br = data[(BADGE_SIZE - 1) * BADGE_SIZE * c + 3];
    let white = 0;
    for (let i = 0; i < data.length; i += c) if (data[i] > 200 && data[i + 3] > 200) white++;
    if (tl !== 0 || br !== 0 || white === 0) {
      console.error(`  ✗ badge: corners must be transparent and glyph must be present`);
      errors++;
    }
  }

  if (!fs.existsSync('public/favicon.ico')) {
    console.error('  ✗ Missing: favicon.ico');
    errors++;
  }

  return errors;
}

function generateSwVersion() {
  const version =
    process.env.VERCEL_DEPLOYMENT_ID ||
    process.env.VERCEL_GIT_COMMIT_SHA ||
    execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim() ||
    'dev';
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  const cache = `royaraqamia-v${pkg.version}-${version}`;
  fs.writeFileSync('public/sw-version.js', `self.CACHE_VERSION = '${cache}';\n`);
  console.log(`  ✓ sw-version.js → ${cache}`);
}

async function main() {
  console.log('Generating icons...');
  for (const size of ANY_SIZES) {
    await tileOnNavy(`${OUT_DIR}/icon-${size}x${size}.png`, size, RATIOS.any);
    console.log(`  ✓ icon-${size}x${size} (circle on navy)`);
  }
  for (const size of MASKABLE_SIZES) {
    await tileMaskable(`${OUT_DIR}/icon-maskable-${size}x${size}.png`, size);
    console.log(`  ✓ icon-maskable-${size}x${size} (maskable, full-bleed)`);
  }
  for (const size of APPLE_TOUCH_SIZES) {
    await tileOnNavy(`${OUT_DIR}/apple-touch-icon-${size}x${size}.png`, size, RATIOS.appleTouch);
    console.log(`  ✓ apple-touch-icon-${size}x${size}`);
  }
  await generateNotificationIcon();
  console.log(`  ✓ notification-icon-${NOTIFICATION_SIZE}x${NOTIFICATION_SIZE}`);
  await generateBadge();
  console.log(`  ✓ badge-icon-${BADGE_SIZE}x${BADGE_SIZE}`);
  await generateFavicon();
  console.log('  ✓ favicon.ico');

  console.log('\nValidating...');
  const errors = await validate();
  if (errors) {
    console.error(`\n${errors} error(s) — fix and rerun`);
    process.exit(1);
  }
  console.log('  All icons validated ✓');

  console.log('\nGenerating SW version...');
  generateSwVersion();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
