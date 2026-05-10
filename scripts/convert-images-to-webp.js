#!/usr/bin/env node

/**
 * Image to WebP Conversion Script
 * Converts all PNG/JPG images in public folder to WebP format
 */

const fs = require('fs');
const path = require('path');

// Check if sharp is available
let sharp;
try {
  sharp = require('sharp');
} catch (error) {
  console.error('❌ Sharp is not installed. Installing...');
  console.error('Please run: npm install --save-dev sharp');
  process.exit(1);
}

const publicDir = path.join(__dirname, '..', 'public');
const imageExtensions = ['.png', '.jpg', '.jpeg'];
const quality = 80; // WebP quality (0-100)

function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

function getFileSize(filePath) {
  try {
    const stats = fs.statSync(filePath);
    return stats.size;
  } catch (error) {
    return 0;
  }
}

async function convertToWebP(inputPath, outputPath) {
  try {
    const originalSize = getFileSize(inputPath);
    
    await sharp(inputPath)
      .webp({ quality })
      .toFile(outputPath);
    
    const newSize = getFileSize(outputPath);
    const savings = originalSize - newSize;
    const savingsPercent = ((savings / originalSize) * 100).toFixed(1);
    
    return {
      success: true,
      originalSize,
      newSize,
      savings,
      savingsPercent
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
}

async function convertImages() {
  console.log('\n🖼️  Converting Images to WebP Format\n');
  console.log('='.repeat(60));
  
  if (!fs.existsSync(publicDir)) {
    console.error('❌ Public directory not found:', publicDir);
    process.exit(1);
  }

  const files = fs.readdirSync(publicDir).filter(file => {
    const ext = path.extname(file).toLowerCase();
    return imageExtensions.includes(ext);
  });

  if (files.length === 0) {
    console.log('ℹ️  No images found to convert.');
    return;
  }

  console.log(`Found ${files.length} image(s) to convert:\n`);

  let totalOriginalSize = 0;
  let totalNewSize = 0;
  const results = [];

  for (const file of files) {
    const inputPath = path.join(publicDir, file);
    const ext = path.extname(file);
    const baseName = path.basename(file, ext);
    const outputPath = path.join(publicDir, `${baseName}.webp`);

    console.log(`Converting: ${file}...`);
    
    const result = await convertToWebP(inputPath, outputPath);
    
    if (result.success) {
      totalOriginalSize += result.originalSize;
      totalNewSize += result.newSize;
      
      results.push({
        file,
        webpFile: `${baseName}.webp`,
        originalSize: result.originalSize,
        newSize: result.newSize,
        savings: result.savings,
        savingsPercent: result.savingsPercent
      });
      
      console.log(`  ✅ Created: ${baseName}.webp`);
      console.log(`     Original: ${formatBytes(result.originalSize)} → WebP: ${formatBytes(result.newSize)}`);
      console.log(`     Savings: ${formatBytes(result.savings)} (${result.savingsPercent}%)\n`);
    } else {
      console.log(`  ❌ Error: ${result.error}\n`);
    }
  }

  // Summary
  if (results.length > 0) {
    const totalSavings = totalOriginalSize - totalNewSize;
    const totalSavingsPercent = ((totalSavings / totalOriginalSize) * 100).toFixed(1);
    
    console.log('='.repeat(60));
    console.log('📊 Conversion Summary:\n');
    console.log(`Total Images Converted: ${results.length}`);
    console.log(`Total Original Size:    ${formatBytes(totalOriginalSize)}`);
    console.log(`Total WebP Size:        ${formatBytes(totalNewSize)}`);
    console.log(`Total Savings:          ${formatBytes(totalSavings)} (${totalSavingsPercent}%)\n`);
    
    console.log('📋 Converted Files:');
    console.log('-'.repeat(60));
    results.forEach(({ file, webpFile, savingsPercent }) => {
      console.log(`  ✅ ${file.padEnd(30)} → ${webpFile.padEnd(30)} (${savingsPercent}% smaller)`);
    });
    
    console.log('\n💡 Next Steps:');
    console.log('   1. Update components to use WebP versions');
    console.log('   2. Test in browser to verify WebP fallback works');
    console.log('   3. Keep original files as fallback\n');
  }
}

// Run conversion
convertImages().catch(error => {
  console.error('❌ Conversion failed:', error);
  process.exit(1);
});

