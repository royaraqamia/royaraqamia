import sharp from 'sharp';
import fs from 'fs';
import { execSync } from 'child_process';

const BG = '#0f172a';
const OUT_DIR = 'public/icons';
const MASTER = 'sources/icon-master.png';

const PNG_OPTS = { compressionLevel: 9, palette: true };

const ICONS = [
  { size: 72 },
  { size: 96 },
  { size: 128 },
  { size: 144 },
  { size: 152 },
  { size: 384 },
  { size: 192, maskable: true },
  { size: 512, maskable: true },
];

const APPLE_TOUCH_SIZES = [152, 167, 180];

if (!fs.existsSync(MASTER)) {
  console.error(`Source icon not found at ${MASTER}. Place a 512x512 PNG there and run again.`);
  process.exit(1);
}

async function generate({ size, maskable }) {
  const fp = `${OUT_DIR}/icon-${size}x${size}.png`;

  if (maskable) {
    const safeSize = Math.round(size * 0.8);
    const offset = Math.round((size - safeSize) / 2);
    const scaled = await sharp(MASTER)
      .resize(safeSize, safeSize, { fit: 'cover', position: 'center' })
      .png(PNG_OPTS)
      .toBuffer();
    await sharp({ create: { width: size, height: size, channels: 4, background: BG } })
      .composite([{ input: scaled, top: offset, left: offset }])
      .png(PNG_OPTS)
      .toFile(fp);
  } else {
    await sharp(MASTER).resize(size, size, { fit: 'cover', position: 'center' })
      .png(PNG_OPTS)
      .toFile(fp);
  }
}

async function generateAppleTouch(size) {
  await sharp(MASTER).resize(size, size, { fit: 'cover', position: 'center' })
    .png(PNG_OPTS)
    .toFile(`${OUT_DIR}/apple-touch-icon-${size}x${size}.png`);
}

async function validate() {
  let errors = 0;
  for (const { size, maskable } of ICONS) {
    const fp = `${OUT_DIR}/icon-${size}x${size}.png`;
    if (!fs.existsSync(fp)) { console.error(`  ✗ Missing: ${size}x${size}`); errors++; continue; }

    const meta = await sharp(fp).metadata();
    if (meta.width !== size || meta.height !== size)
      { console.error(`  ✗ ${size}x${size}: dimensions ${meta.width}x${meta.height}`); errors++; continue; }

    const { data, info } = await sharp(fp).raw().toBuffer({ resolveWithObject: true });
    const c = info.channels;
    const px = (x, y) => {
      const i = (y * size + x) * c;
      return { r: data[i], g: data[i + 1], b: data[i + 2], a: c > 3 ? data[i + 3] : 255 };
    };
    const corners = { TL: px(0, 0), TR: px(size - 1, 0), BL: px(0, size - 1), BR: px(size - 1, size - 1) };

    for (const [label, p] of Object.entries(corners)) {
      if (maskable) {
        if (p.r !== 15 || p.g !== 23 || p.b !== 42 || p.a !== 255)
          { console.error(`  ✗ ${size}x${size} maskable: ${label} rgba(${p.r},${p.g},${p.b},${p.a}) ≠ (15,23,42,255)`); errors++; }
      } else {
        if (p.a !== 0)
          { console.error(`  ✗ ${size}x${size} standard: ${label} alpha=${p.a} ≠ 0`); errors++; }
      }
    }
  }

  for (const size of APPLE_TOUCH_SIZES) {
    if (!fs.existsSync(`${OUT_DIR}/apple-touch-icon-${size}x${size}.png`))
      { console.error(`  ✗ Missing: apple-touch-icon-${size}x${size}`); errors++; }
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
  for (const icon of ICONS) { await generate(icon); console.log(`  ✓ ${icon.size}x${icon.size}${icon.maskable ? ' (maskable)' : ''}`); }
  for (const size of APPLE_TOUCH_SIZES) { await generateAppleTouch(size); console.log(`  ✓ apple-touch-icon-${size}x${size}`); }

  console.log('\nValidating...');
  const errors = await validate();
  if (errors) { console.error(`\n${errors} error(s) — fix and rerun`); process.exit(1); }
  console.log('  All icons validated ✓');

  console.log('\nGenerating SW version...');
  generateSwVersion();
}

main().catch((e) => { console.error(e); process.exit(1); });
