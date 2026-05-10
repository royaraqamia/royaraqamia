#!/usr/bin/env node

/**
 * Bundle Size Analysis Script
 * Analyzes the built bundle sizes and provides recommendations
 */

const fs = require('fs');
const path = require('path');

const distDir = path.join(__dirname, '..', 'dist', 'assets');
const sizeLimit = {
  'total': 500 * 1024, // 500KB total JS
  'initial': 300 * 1024, // 300KB initial bundle
  'vendor': 200 * 1024, // 200KB vendor chunks
  'css': 50 * 1024, // 50KB CSS
};

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

function analyzeBundle() {
  console.log('\n📦 Bundle Size Analysis\n');
  console.log('='.repeat(60));

  if (!fs.existsSync(distDir)) {
    console.error('❌ dist/assets directory not found. Please run "npm run build" first.');
    process.exit(1);
  }

  const files = fs.readdirSync(distDir);
  const jsFiles = files.filter(f => f.endsWith('.js'));
  const cssFiles = files.filter(f => f.endsWith('.css'));
  
  let totalSize = 0;
  let jsSize = 0;
  let cssSize = 0;
  
  const chunks = {
    'react-vendor': [],
    'ui-vendor': [],
    'radix-vendor': [],
    'main': [],
    'other': []
  };

  // Analyze JS files
  console.log('\n📄 JavaScript Files:');
  console.log('-'.repeat(60));
  
  jsFiles.forEach(file => {
    const filePath = path.join(distDir, file);
    const size = getFileSize(filePath);
    jsSize += size;
    totalSize += size;
    
    let chunkType = 'other';
    if (file.includes('react-vendor')) chunkType = 'react-vendor';
    else if (file.includes('ui-vendor')) chunkType = 'ui-vendor';
    else if (file.includes('radix-vendor')) chunkType = 'radix-vendor';
    else if (file.includes('index') || file.includes('main')) chunkType = 'main';
    
    chunks[chunkType].push({ file, size });
    
    const status = size > sizeLimit.vendor ? '⚠️ ' : '✅ ';
    console.log(`${status} ${file.padEnd(40)} ${formatBytes(size).padStart(10)}`);
  });

  // Analyze CSS files
  console.log('\n🎨 CSS Files:');
  console.log('-'.repeat(60));
  
  cssFiles.forEach(file => {
    const filePath = path.join(distDir, file);
    const size = getFileSize(filePath);
    cssSize += size;
    totalSize += size;
    
    const status = size > sizeLimit.css ? '⚠️ ' : '✅ ';
    console.log(`${status} ${file.padEnd(40)} ${formatBytes(size).padStart(10)}`);
  });

  // Summary
  console.log('\n📊 Summary:');
  console.log('='.repeat(60));
  console.log(`Total Bundle Size:     ${formatBytes(totalSize).padStart(10)} ${totalSize > sizeLimit.total ? '⚠️  Large' : '✅ Good'}`);
  console.log(`JavaScript:            ${formatBytes(jsSize).padStart(10)} ${jsSize > sizeLimit.total ? '⚠️  Large' : '✅ Good'}`);
  console.log(`CSS:                   ${formatBytes(cssSize).padStart(10)} ${cssSize > sizeLimit.css ? '⚠️  Large' : '✅ Good'}`);

  // Chunk analysis
  console.log('\n📦 Chunk Analysis:');
  console.log('-'.repeat(60));
  Object.entries(chunks).forEach(([chunkType, files]) => {
    if (files.length > 0) {
      const chunkSize = files.reduce((sum, f) => sum + f.size, 0);
      const status = chunkSize > sizeLimit.vendor ? '⚠️ ' : '✅ ';
      console.log(`${status} ${chunkType.padEnd(20)} ${formatBytes(chunkSize).padStart(10)} (${files.length} file${files.length > 1 ? 's' : ''})`);
    }
  });

  // Recommendations
  console.log('\n💡 Recommendations:');
  console.log('='.repeat(60));
  
  if (totalSize > sizeLimit.total) {
    console.log('⚠️  Total bundle size is large. Consider:');
    console.log('   - Code splitting: Split routes/components');
    console.log('   - Dynamic imports: Lazy load heavy libraries');
    console.log('   - Tree shaking: Remove unused code');
    console.log('   - Compression: Ensure GZIP/Brotli is enabled');
  }
  
  if (jsSize > sizeLimit.total) {
    console.log('⚠️  JavaScript bundle is large. Consider:');
    console.log('   - Analyze with: npm run build:analyze');
    console.log('   - Check for duplicate dependencies');
    console.log('   - Use dynamic imports for heavy libraries (framer-motion, recharts)');
  }
  
  if (cssSize > sizeLimit.css) {
    console.log('⚠️  CSS bundle is large. Consider:');
    console.log('   - Remove unused Tailwind classes');
    console.log('   - Purge CSS in production');
    console.log('   - Split CSS by route');
  }

  // Check for large individual files
  const largeFiles = [...jsFiles, ...cssFiles]
    .map(file => ({ file, size: getFileSize(path.join(distDir, file)) }))
    .filter(f => f.size > 100 * 1024) // Files larger than 100KB
    .sort((a, b) => b.size - a.size);

  if (largeFiles.length > 0) {
    console.log('\n📌 Large Files (>100KB):');
    console.log('-'.repeat(60));
    largeFiles.forEach(({ file, size }) => {
      console.log(`   ${file.padEnd(40)} ${formatBytes(size).padStart(10)}`);
    });
  }

  console.log('\n✅ Analysis complete!\n');
}

// Run analysis
analyzeBundle();

