const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const sourcePath = path.join(__dirname, '../public/logo.png');
const outputDir = path.join(__dirname, '../public/icons');

// Create icons directory if it doesn't exist
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// Required PWA icon sizes
const iconSizes = [
  { size: 72, name: 'icon-72x72.png' },
  { size: 96, name: 'icon-96x96.png' },
  { size: 128, name: 'icon-128x128.png' },
  { size: 144, name: 'icon-144x144.png' },
  { size: 152, name: 'icon-152x152.png' },
  { size: 192, name: 'icon-192x192.png' },
  { size: 384, name: 'icon-384x384.png' },
  { size: 512, name: 'icon-512x512.png' },
];

// Favicon sizes
const faviconSizes = [
  { size: 16, name: 'favicon-16x16.png' },
  { size: 32, name: 'favicon-32x32.png' },
];

// Apple touch icon
const appleIcon = { size: 180, name: 'apple-touch-icon.png' };

async function generateIcons() {
  console.log('Generating PWA icons from logo.png...');
  
  try {
    // Generate PWA icons
    for (const { size, name } of iconSizes) {
      await sharp(sourcePath)
        .resize(size, size, {
          fit: 'cover',
          position: 'center',
        })
        .png({ quality: 90, compressionLevel: 9 })
        .toFile(path.join(outputDir, name));
      console.log(`✓ Generated ${name}`);
    }

    // Generate favicons
    for (const { size, name } of faviconSizes) {
      await sharp(sourcePath)
        .resize(size, size, {
          fit: 'cover',
          position: 'center',
        })
        .png({ quality: 90, compressionLevel: 9 })
        .toFile(path.join(outputDir, name));
      console.log(`✓ Generated ${name}`);
    }

    // Generate Apple touch icon
    await sharp(sourcePath)
      .resize(appleIcon.size, appleIcon.size, {
        fit: 'cover',
        position: 'center',
      })
      .png({ quality: 90, compressionLevel: 9 })
      .toFile(path.join(outputDir, appleIcon.name));
    console.log(`✓ Generated ${appleIcon.name}`);

    // Also copy to public root for compatibility
    await sharp(sourcePath)
      .resize(192, 192, {
        fit: 'cover',
        position: 'center',
      })
      .png({ quality: 90, compressionLevel: 9 })
      .toFile(path.join(__dirname, '../public/icon-192x192.png'));
    console.log('✓ Generated public/icon-192x192.png');

    await sharp(sourcePath)
      .resize(512, 512, {
        fit: 'cover',
        position: 'center',
      })
      .png({ quality: 90, compressionLevel: 9 })
      .toFile(path.join(__dirname, '../public/icon-512x512.png'));
    console.log('✓ Generated public/icon-512x512.png');

    console.log('\n✅ All PWA icons generated successfully!');
  } catch (error) {
    console.error('❌ Error generating icons:', error);
    process.exit(1);
  }
}

generateIcons();
