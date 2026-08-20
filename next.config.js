const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
});

const { withSentryConfig } = require('@sentry/nextjs');

/** @type {import('next').NextConfig} */
const csp = `
default-src 'self';
script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com ${process.env.NODE_ENV === 'development' ? "'unsafe-eval'" : ''};
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
font-src 'self' https://fonts.gstatic.com data:;
img-src 'self' data: https: blob: https://*.supabase.co;
worker-src 'self' blob:;
connect-src 'self' https://api.royaraqamia.com https://royaraqamia.com https://*.supabase.co https://challenges.cloudflare.com wss: ws:;
frame-src https://challenges.cloudflare.com;
base-uri 'self';
form-action 'self' https://forms.gle;
frame-ancestors 'self';
upgrade-insecure-requests;
`;

// Validate required env vars at build time
const requiredEnvVars = ['NEXT_PUBLIC_WHATSAPP_PHONE'];
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    throw new Error(`Missing required environment variable: ${envVar}`);
  }
}

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ['motion'],
  experimental: {
    staleTimes: {
      dynamic: 30,
      static: 300,
    },
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [
      { protocol: 'https', hostname: 'royaraqamia.com' },
      { protocol: 'https', hostname: '*.royaraqamia.com' },
      { protocol: 'https', hostname: '*.supabase.co' },
      { protocol: 'https', hostname: 'picsum.photos' },
      { protocol: 'https', hostname: '*.googleusercontent.com' },
    ],
  },
  async rewrites() {
    return [
      {
        source: '/unlock/:code',
        destination: '/linksnap/unlock/:code',
      },
    ];
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
          { key: 'X-Permitted-Cross-Domain-Policies', value: 'none' },
          { key: 'X-DNS-Prefetch-Control', value: 'on' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), payment=()',
          },
        ],
      },
      {
        source: '/blog/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, s-maxage=60, stale-while-revalidate=600' },
        ],
      },
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
      {
        source: '/:path*.webp',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=86400, stale-while-revalidate=604800' },
        ],
      },
      {
        source: '/:path*.png',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=86400, stale-while-revalidate=604800' },
        ],
      },
      {
        source: '/:path*.ttf',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=86400, stale-while-revalidate=604800' },
        ],
      },
      {
        source: '/:path*.woff2',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=86400, stale-while-revalidate=604800' },
        ],
      },
      {
        source: '/:path*.svg',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=86400, stale-while-revalidate=604800' },
        ],
      },
      {
        source: '/:path*.ico',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=86400, stale-while-revalidate=604800' },
        ],
      },
      {
        source: '/:path*.manifest',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=86400, stale-while-revalidate=604800' },
        ],
      },
    ];
  },
};

const sentryWebpackPluginOptions = {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: true,
  dryRun: !process.env.SENTRY_AUTH_TOKEN,
  widenClientFileUpload: true,
  tunnelRoute: '/monitoring',
  hideSourceMaps: true,
  webpack: {
    treeshake: { removeDebugLogging: true },
    automaticVercelMonitors: true,
    reactComponentAnnotation: { enabled: true },
  },
};

const skipSentryPlugin = process.env.VERCEL !== '1';
module.exports = skipSentryPlugin
  ? withBundleAnalyzer(nextConfig)
  : withSentryConfig(withBundleAnalyzer(nextConfig), sentryWebpackPluginOptions);
