#!/usr/bin/env node

/**
 * Bundle Size Analysis Script
 * Analyzes the production build to identify large dependencies
 * 
 * Usage: npm run analyze-bundle
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('📦 Analyzing bundle size...\n');

try {
  // Build the project
  console.log('Building project...');
  execSync('npm run build', { stdio: 'inherit' });

  // Check if dist directory exists
  const distPath = path.join(process.cwd(), 'dist');
  if (!fs.existsSync(distPath)) {
    console.error('❌ dist directory not found. Build may have failed.');
    process.exit(1);
  }

  // Analyze JavaScript files
  const jsFiles = [];
  const cssFiles = [];
  
  function analyzeDirectory(dir) {
    const files = fs.readdirSync(dir);
    
    files.forEach(file => {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);
      
      if (stat.isDirectory()) {
        analyzeDirectory(filePath);
      } else {
        const size = stat.size;
        const sizeKB = (size / 1024).toFixed(2);
        const sizeMB = (size / 1024 / 1024).toFixed(2);
        
        if (file.endsWith('.js')) {
          jsFiles.push({ name: file, path: filePath, size, sizeKB, sizeMB });
        } else if (file.endsWith('.css')) {
          cssFiles.push({ name: file, path: filePath, size, sizeKB, sizeMB });
        }
      }
    });
  }

  analyzeDirectory(distPath);

  // Sort by size
  jsFiles.sort((a, b) => b.size - a.size);
  cssFiles.sort((a, b) => b.size - a.size);

  // Report results
  console.log('\n📊 Bundle Analysis Results\n');
  console.log('='.repeat(60));
  
  console.log('\n📦 JavaScript Files:');
  console.log('-'.repeat(60));
  let totalJSSize = 0;
  jsFiles.forEach((file, index) => {
    totalJSSize += file.size;
    const sizeStr = file.sizeMB > 1 
      ? `${file.sizeMB} MB` 
      : `${file.sizeKB} KB`;
    console.log(`${(index + 1).toString().padStart(2)}. ${file.name.padEnd(40)} ${sizeStr.padStart(10)}`);
  });
  
  console.log('\n🎨 CSS Files:');
  console.log('-'.repeat(60));
  let totalCSSSize = 0;
  cssFiles.forEach((file, index) => {
    totalCSSSize += file.size;
    const sizeStr = file.sizeMB > 1 
      ? `${file.sizeMB} MB` 
      : `${file.sizeKB} KB`;
    console.log(`${(index + 1).toString().padStart(2)}. ${file.name.padEnd(40)} ${sizeStr.padStart(10)}`);
  });

  const totalSize = totalJSSize + totalCSSSize;
  const totalSizeMB = (totalSize / 1024 / 1024).toFixed(2);
  const totalSizeKB = (totalSize / 1024).toFixed(2);

  console.log('\n📈 Summary:');
  console.log('-'.repeat(60));
  console.log(`Total JavaScript: ${(totalJSSize / 1024 / 1024).toFixed(2)} MB`);
  console.log(`Total CSS: ${(totalCSSSize / 1024 / 1024).toFixed(2)} MB`);
  console.log(`Total Bundle Size: ${totalSizeMB} MB (${totalSizeKB} KB)`);
  
  // Recommendations
  console.log('\n💡 Recommendations:');
  console.log('-'.repeat(60));
  
  const largeJSFiles = jsFiles.filter(f => f.size > 200 * 1024); // > 200KB
  if (largeJSFiles.length > 0) {
    console.log('⚠️  Large JavaScript files detected (>200KB):');
    largeJSFiles.forEach(file => {
      console.log(`   - ${file.name}: ${file.sizeMB} MB`);
      console.log(`     Consider code splitting or lazy loading`);
    });
  }
  
  if (totalJSSize > 500 * 1024) { // > 500KB
    console.log('⚠️  Total JavaScript bundle is large (>500KB)');
    console.log('   Consider:');
    console.log('   - More aggressive code splitting');
    console.log('   - Lazy loading routes');
    console.log('   - Tree shaking unused code');
  }
  
  if (totalSize > 1000 * 1024) { // > 1MB
    console.log('⚠️  Total bundle size is large (>1MB)');
    console.log('   Target: < 1MB for optimal performance');
  } else {
    console.log('✅ Bundle size is within acceptable limits');
  }

  console.log('\n' + '='.repeat(60));
  console.log('✅ Analysis complete!\n');

} catch (error) {
  console.error('❌ Error analyzing bundle:', error.message);
  process.exit(1);
}

