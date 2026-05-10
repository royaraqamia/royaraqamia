const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const images = [
  { input: 'public/logo.png', output: 'public/logo.webp' },
  { input: 'public/avatar.png', output: 'public/avatar.webp' },
];

async function optimizeImages() {
  for (const image of images) {
    if (fs.existsSync(image.input)) {
      await sharp(image.input).webp({ quality: 80 }).toFile(image.output);
      console.log(`✅ Optimized: ${image.output}`);
    }
  }
}

optimizeImages().catch(console.error);

