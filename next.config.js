const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
});

const { withSentryConfig } = require('@sentry/nextjs/config');

/** @type {import('next').NextConfig} */
const csp = `
default-src 'self';
script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' https://challenges.cloudflare.com ${process.env.NODE_ENV === 'development' ? "'unsafe-eval'" : ''};
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
font-src 'self' https://fonts.gstatic.com data:;
img-src 'self' data: https: blob: https://*.supabase.co;
worker-src 'self' blob:;
connect-src 'self' https://api.royaraqamia.com https://royaraqamia.com https://*.supabase.co https://challenges.cloudflare.com wss: ws:;
frame-src https://challenges.cloudflare.com;
base-uri 'self';
form-action 'self' https://forms.gle http://127.0.0.1:* http://localhost:*;
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
    // Every client navigation/prefetch that misses this cache is a full RSC
    // function invocation. On Hobby the Fluid Active CPU budget (4h/month) is
    // the binding limit, so the client cache is the cheapest place to remove
    // invocations: 30s/300s was refetching shared layouts constantly on a site
    // whose data changes on publish (tag-invalidated), not on a timer.
    staleTimes: {
      dynamic: 120,
      static: 1800,
    },
    // Expand lucide-react named imports to per-icon modules so only used
    // glyphs are bundled instead of the barrel's icon map.
    optimizePackageImports: ['lucide-react'],
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  // Keep files that can never be `require`d at runtime out of the traced set
  // copied into each function bundle: source maps, test files, and package
  // metadata. Note this is defensive, not the storage fix — Functions Storage on
  // Hobby (10 GB) is dominated by the *number* of retained deployments, which is
  // what `.github/workflows/prune-deployments.yml` addresses. The broad
  // `test/`+`docs/` directory patterns are deliberately left out: some packages
  // ship runtime files in those directories, and the saving is unmeasured.
  outputFileTracingExcludes: {
    '/*': [
      '**/*.map',
      '**/*.test.*',
      '**/*.spec.*',
      '**/__tests__/**',
      '**/{README,CHANGELOG,LICENSE,license}*',
    ],
  },
  images: {
    formats: ['image/avif', 'image/webp'],
    // Optimized variants are content-addressed by URL; a long TTL lets the
    // CDN serve repeat requests without re-validating against the origin.
    minimumCacheTTL: 86400,
    remotePatterns: [
      { protocol: 'https', hostname: 'royaraqamia.com' },
      { protocol: 'https', hostname: '*.royaraqamia.com' },
      { protocol: 'https', hostname: '*.supabase.co' },
      { protocol: 'https', hostname: 'picsum.photos' },
      { protocol: 'https', hostname: '*.googleusercontent.com' },
    ],
  },
  async redirects() {
    // The public blog was renamed to Community. Preserve inbound links and
    // SEO equity with a permanent redirect from the old paths.
    //
    // The product dashboards moved from `/<product>/app` to `/<product>` when
    // their marketing landing pages were removed. Keep old bookmarks and
    // indexed URLs working with a permanent redirect.
    const productAppRedirects = ['linksnap', 'habitflow', 'blogpress', 'spendtrack'].flatMap(
      (product) => [
        {
          source: `/${product}/app`,
          destination: `/${product}`,
          permanent: true,
        },
        {
          source: `/${product}/app/:path*`,
          destination: `/${product}/:path*`,
          permanent: true,
        },
      ]
    );

    return [
      {
        source: '/blog',
        destination: '/community',
        permanent: true,
      },
      {
        source: '/blog/:path*',
        destination: '/community/:path*',
        permanent: true,
      },
      ...productAppRedirects,
    ];
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
            // `camera=(self)` is what the Scanner needs (ADR-0035). `self`, never
            // `*`: a wildcard would let any third-party frame we ever embed
            // borrow a visitor's camera. Nothing else is granted.
            value: 'camera=(self), microphone=(), geolocation=(), payment=()',
          },
        ],
      },
      {
        source: '/community/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, s-maxage=300, stale-while-revalidate=1800' },
        ],
      },
      // The homepage is fully static (prerendered at build); let the CDN serve
      // it without re-validating while SWR keeps it fresh in the background.
      {
        source: '/',
        headers: [
          { key: 'Cache-Control', value: 'public, s-maxage=3600, stale-while-revalidate=86400' },
        ],
      },
      // The manifest's icon URLs are content-versioned, but the manifest file
      // itself must be re-read on every visit so an installed app notices the
      // new URLs. Never let the browser serve a cached copy.
      {
        source: '/manifest.json',
        headers: [{ key: 'Cache-Control', value: 'no-cache, must-revalidate' }],
      },
      // NOTE: /sw.js caching lives in vercel.json (stricter no-store variant).
      // Keep it there only — a second definition here produced conflicting
      // Cache-Control values.
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
  // Name releases after the git tag (vX.Y.Z) so Vercel-uploaded sourcemaps,
  // CI commit association and Sentry issues all reference the same release.
  // npm_package_version is injected by npm for the `build` lifecycle script.
  release: process.env.SENTRY_RELEASE ?? `v${process.env.npm_package_version}`,
  silent: true,
  dryRun: !process.env.SENTRY_AUTH_TOKEN,
  // Source maps are only useful if they are uploaded. With no auth token there
  // is nothing to upload, so skip generating them (`.next/server` was 77% maps
  // on a local build) — those bytes otherwise land in every deployment's
  // function payload. With a token, upload then delete them from the output.
  sourcemaps: process.env.SENTRY_AUTH_TOKEN
    ? { deleteSourcemapsAfterUpload: true }
    : { disable: true },
  // Client events are tunnelled through `/monitoring`, a Vercel function
  // invocation per event (the CSP forbids direct sentry.io calls, so the tunnel
  // stays). Keeping it cheap is a sampling problem — see the client trace rate
  // in frontend/shared/sentry.ts.
  tunnelRoute: '/monitoring',
  // Middleware runs on nearly every request here, so Sentry's per-invocation
  // transaction wrapping is the most expensive place it can be enabled. The
  // middleware only reads cookies and geo headers; errors there surface
  // through the route handlers anyway.
  autoInstrumentMiddleware: false,
  // Annotating every JSX element with data-sentry-* attributes inflates the RSC
  // payload and the client chunks; we do not use component-name search.
  reactComponentAnnotation: { enabled: false },
  // The daily rates refresh is already covered by its own logging.
  automaticVercelMonitors: false,
  webpack: {
    // NOTE: `hideSourceMaps`, `widenClientFileUpload`, `reactComponentAnnotation`
    // and `automaticVercelMonitors` do not live here in SDK v11 — the previous
    // values were silently ignored. See the top-level options above.
    treeshake: { removeDebugLogging: true },
  },
};

const skipSentryPlugin = process.env.VERCEL !== '1';
module.exports = skipSentryPlugin
  ? withBundleAnalyzer(nextConfig)
  : withSentryConfig(withBundleAnalyzer(nextConfig), sentryWebpackPluginOptions);
