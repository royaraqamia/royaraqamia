const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://royaraqamia.com';

function generateSitemap() {
  const urls = [];

  // Main Landing Page
  urls.push(`
    <url>
      <loc>${BASE_URL}/</loc>
      <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>
      <changefreq>weekly</changefreq>
      <priority>1.0</priority>
    </url>
  `);

  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
  <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
    ${urls.join('\n')}
  </urlset>`;

  // Save file to public directory
  const publicDir = path.join(__dirname, '../public');
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }

  fs.writeFileSync(path.join(publicDir, 'sitemap.xml'), sitemap.trim());
  console.log('✅ Sitemap generated successfully!');
}

generateSitemap();
