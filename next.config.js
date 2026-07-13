/** @type {import('next').NextConfig} */
const isDev = process.env.NODE_ENV === 'development';
const scriptSrc = ["'self'", "'unsafe-inline'", isDev && "'unsafe-eval'"].filter(Boolean).join(' ');
const csp = `
default-src 'self';
script-src ${scriptSrc};
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
font-src 'self' https://fonts.gstatic.com data:;
img-src 'self' data: https: blob:;
connect-src 'self' https://api.royaraqamia.com https://royaraqamia.com wss: ws:;
base-uri 'self';
form-action 'self' https://forms.gle;
frame-ancestors 'self';
upgrade-insecure-requests;
`;

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'royaraqamia.com',
      },
      {
        protocol: 'https',
        hostname: '*.royaraqamia.com',
      },
    ],
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains; preload',
          },
          { key: 'Content-Security-Policy', value: csp.replace(/\s+/g, ' ').trim() },
          { key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' },
          { key: 'X-Permitted-Cross-Domain-Policies', value: 'none' },
          { key: 'X-DNS-Prefetch-Control', value: 'on' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), payment=()',
          },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
