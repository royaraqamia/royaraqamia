import sharp from 'sharp';
import fs from 'fs';
import { execSync } from 'child_process';

const NAVY = { r: 15, g: 23, b: 42 };
const OUT_DIR = 'public/icons';
const MASTER = 'public/logo.webp';

// Tile size as a fraction of the icon canvas. Maskable icons keep the logo
// inside the 80% safe zone; "any" and apple-touch tiles are larger since they
// are not circle-masked by Android.
const RATIOS = {
  any: 0.72,
  maskable: 0.55,
  appleTouch: 0.78,
};

const ICONS = [
  { size: 72, ratio: RATIOS.any },
  { size: 96, ratio: RATIOS.any },
  { size: 128, ratio: RATIOS.any },
  { size: 144, ratio: RATIOS.any },
  { size: 152, ratio: RATIOS.any },
  { size: 384, ratio: RATIOS.any },
  { size: 192, ratio: RATIOS.maskable },
  { size: 512, ratio: RATIOS.maskable },
];

const APPLE_TOUCH_SIZES = [152, 167, 180];
const NOTIFICATION_SIZE = 192;
const BADGE_SIZE = 96;
const FAVICON_SIZES = [16, 32, 48, 256];

if (!fs.existsSync(MASTER)) {
  console.error(
    `Source logo not found at ${MASTER}. Place a square logo.webp there and run again.`
  );
  process.exit(1);
}

async function tileIcon(file, size, ratio) {
  const logoSize = Math.round(size * ratio);
  const logo = await sharp(MASTER).resize(logoSize, logoSize, { fit: 'fill' }).toBuffer();
  await sharp({ create: { width: size, height: size, channels: 3, background: NAVY } })
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
  await sharp(raw, { raw: { width: bw, height: bh, channels: 4 } })
    .resize(BADGE_SIZE, BADGE_SIZE, { fit: 'fill' })
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

async function validate() {
  let errors = 0;
  const cornerPixels = async (fp, size) => {
    const { data, info } = await sharp(fp).raw().toBuffer({ resolveWithObject: true });
    const c = info.channels;
    const px = (x, y) => {
      const i = (y * size + x) * c;
      return { r: data[i], g: data[i + 1], b: data[i + 2], a: c > 3 ? data[i + 3] : 255 };
    };
    return { TL: px(0, 0), TR: px(size - 1, 0), BL: px(0, size - 1), BR: px(size - 1, size - 1) };
  };

  for (const { size } of ICONS) {
    const fp = `${OUT_DIR}/icon-${size}x${size}.png`;
    if (!fs.existsSync(fp)) {
      console.error(`  ✗ Missing: ${size}x${size}`);
      errors++;
      continue;
    }
    const meta = await sharp(fp).metadata();
    if (meta.width !== size || meta.height !== size) {
      console.error(`  ✗ ${size}x${size}: dimensions ${meta.width}x${meta.height}`);
      errors++;
      continue;
    }
    const corners = await cornerPixels(fp, size);
    for (const [label, p] of Object.entries(corners)) {
      if (!NAVY_PX(p)) {
        console.error(`  ✗ ${size}x${size}: ${label} rgba(${p.r},${p.g},${p.b},${p.a}) ≠ navy`);
        errors++;
      }
    }
  }

  for (const size of APPLE_TOUCH_SIZES) {
    const fp = `${OUT_DIR}/apple-touch-icon-${size}x${size}.png`;
    if (!fs.existsSync(fp)) {
      console.error(`  ✗ Missing: apple-touch-icon-${size}x${size}`);
      errors++;
      continue;
    }
    const corners = await cornerPixels(fp, size);
    for (const [label, p] of Object.entries(corners)) {
      if (!NAVY_PX(p)) {
        console.error(`  ✗ apple-touch ${size}: ${label} rgba(${p.r},${p.g},${p.b},${p.a}) ≠ navy`);
        errors++;
      }
    }
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
  for (const { size } of ICONS) {
    await tileIcon(
      `${OUT_DIR}/icon-${size}x${size}.png`,
      size,
      ICONS.find((i) => i.size === size).ratio
    );
    console.log(`  ✓ icon-${size}x${size}`);
  }
  for (const size of APPLE_TOUCH_SIZES) {
    await tileIcon(`${OUT_DIR}/apple-touch-icon-${size}x${size}.png`, size, RATIOS.appleTouch);
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
