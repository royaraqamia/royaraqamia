/**
 * Draws the recitation's cover: the one artwork the system's media controls show
 * for every sura (ADR-0085).
 *
 * The Mark is the site's own, on the brand gradient, with no text: the Media
 * Session already draws the sura's name and the Ayah, and artwork text would
 * compete with them at the notification's size. Two sizes are written because
 * Android's large icon and a lock screen ask for different densities.
 *
 * Usage: node scripts/generate-quran-cover.mjs
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';

const root = process.cwd();
const mark = readFileSync(join(root, 'public', 'icons', 'icon-1024x1024.png')).toString('base64');

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#4c1d95"/>
      <stop offset="55%" stop-color="#5b21b6"/>
      <stop offset="100%" stop-color="#1e1b4b"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0%" stop-color="#a78bfa" stop-opacity="0.55"/>
      <stop offset="100%" stop-color="#a78bfa" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1024" height="1024" fill="url(#bg)"/>
  <circle cx="796" cy="210" r="430" fill="url(#glow)"/>
  <circle cx="228" cy="838" r="360" fill="url(#glow)" opacity="0.45"/>
  <image href="data:image/png;base64,${mark}" x="182" y="182" width="660" height="660"/>
</svg>`;

const buffer = Buffer.from(svg);

for (const size of [512, 1024]) {
  await sharp(buffer)
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toFile(join(root, 'public', 'quran', 'audio', `cover-${size}.png`));
  process.stdout.write(`cover-${size}.png\n`);
}
