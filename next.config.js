const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
});

const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const { withSentryConfig } = require('@sentry/nextjs/config');

/**
 * The Sentry release, read from the same generated module the app reports with
 * (`backend/config/generated/app-version.ts`), so an uploaded sourcemap and the
 * event it describes can never name different releases.
 *
 * It used to be `v<package.json version>`, with the release workflow naming the
 * git tag the same thing. The web has no releases any more (ADR-0089), and the
 * runtime release is now `<semver>+build.<count>.<sha>` — a deploy identity, not
 * a version anybody installs. A prefix that differed would leave every event
 * without sourcemaps, which is the failure this replaces.
 *
 * `prebuild` regenerates the module before `next build`, so this reads a file
 * this build wrote. A missing file (a checkout mid-repair) degrades to the
 * package version rather than breaking the build.
 */
const sentryRelease = () => {
  if (process.env.SENTRY_RELEASE) return process.env.SENTRY_RELEASE;
  try {
    const generated = readFileSync(
      join(__dirname, 'backend', 'config', 'generated', 'app-version.ts'),
      'utf8'
    );
    const match = /releaseVersion:\s*'([^']+)'/.exec(generated);
    if (match) return match[1];
  } catch {
    // Fall through: a build must not fail because the generated file is absent.
  }
  return `web-${require('./package.json').version}`;
};

/** @type {import('next').NextConfig} */
const csp = `
default-src 'self';
script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' https://challenges.cloudflare.com ${process.env.NODE_ENV === 'development' ? "'unsafe-eval'" : ''};
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
font-src 'self' https://fonts.gstatic.com data:;
img-src 'self' data: https: blob: https://*.supabase.co;
media-src 'self' https://audio.royaraqamia.com blob:;
worker-src 'self' blob:;
connect-src 'self' https://api.royaraqamia.com https://royaraqamia.com https://*.supabase.co https://challenges.cloudflare.com https://audio.royaraqamia.com wss: ws:;
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
    // Next sizes its build worker pool from the machine's core count. Render's
    // build machines report many cores, so the first deploy ran
    // "Collecting page data using 47 workers" and died on
    // "Ran out of memory (used over 8GB)". Two workers build the same pages,
    // just not simultaneously; the flag stays off everywhere else so a local
    // build keeps the parallelism it can afford.
    cpus: process.env.RENDER ? 2 : undefined,
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
  // The assistant's specialist tools read the vendored roster at request time
  // (`backend/services/chat/agency-skills.ts`); Next ships only what a function
  // reaches, so the tree is named here. The terminal and the Telegram bot read
  // the same directory from the checkout (ADR-0137).
  outputFileTracingIncludes: {
    '/api/chats/**': ['./.opencode/skills/agency/**'],
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
    const productAppRedirects = ['linksnap', 'habitflow', 'spendtrack'].flatMap((product) => [
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
    ]);

    return [
      // The apps are tabs of the door now (ADR-0156, ADR-0168): an app's own
      // page is no longer served, and an old bookmark, a push target and a shared
      // link land on the tab instead. The request's query is passed through, so
      // `?error=` and `?code=` still reach the surface that explains them.
      {
        source: '/linksnap',
        destination: '/?tab=/linksnap',
        permanent: false,
      },
      {
        source: '/news',
        destination: '/?tab=/news',
        permanent: false,
      },
      {
        source: '/rates',
        destination: '/?tab=/rates',
        permanent: false,
      },
      {
        // The root only: `/athkar/evening` is a mode of the surface, not a
        // second door, and it keeps its own address until the surface draws the
        // mode from the tab.
        source: '/athkar',
        destination: '/?tab=/athkar',
        permanent: false,
      },
      {
        source: '/scan',
        destination: '/?tab=/scan',
        permanent: false,
      },
      {
        source: '/quran',
        destination: '/?tab=/quran',
        permanent: false,
      },
      {
        source: '/notes',
        destination: '/?tab=/notes',
        permanent: false,
      },
      {
        source: '/habitflow',
        destination: '/?tab=/habitflow',
        permanent: false,
      },
      {
        source: '/spendtrack',
        destination: '/?tab=/spendtrack',
        permanent: false,
      },
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
      // The release-notes page is gone: an installed shell and an old bookmark
      // both land on the account page instead of a 404 (ADR-0124).
      {
        source: '/account/changelog',
        destination: '/account',
        permanent: true,
      },
      // BlogPress retired as a UI door: its dashboard, calendar and editor now
      // live on the account's posts page, and old links follow them there.
      {
        source: '/blogpress/editor/:id',
        destination: '/account/posts?edit=:id',
        permanent: true,
      },
      {
        source: '/blogpress/calendar',
        destination: '/account/posts?status=scheduled',
        permanent: true,
      },
      {
        source: '/blogpress/app/:path*',
        destination: '/account/posts',
        permanent: true,
      },
      {
        source: '/blogpress/:path*',
        destination: '/account/posts',
        permanent: true,
      },
      ...productAppRedirects,
    ];
  },
  async rewrites() {
    // The signed APK is served from our own origin, not from the GitHub release
    // that also carries it as an archive: release assets are unreachable from at
    // least one country this app has users in, and an update that cannot be
    // downloaded is not an update (ADR-0047).
    //
    // A rewrite, deliberately, and not a route handler: a function's response body
    // is capped at 4.5 MB and the APK is ~7.4 MB. This is proxied at the routing
    // layer instead, so the size does not apply and no function is invoked.
    //
    // The `:file(.*\.apk)` constraint keeps the rule to the one shape the manifest
    // names. `/android/latest.json` is a file in `public/`, and filesystem routes
    // are matched before rewrites, so the manifest is never proxied to the bucket.
    const storage = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!storage) {
      // Local builds without Supabase configured still stack up; the APK path is
      // simply 404 until the env is set, which is louder than a silent proxy to
      // nowhere.
      console.warn('NEXT_PUBLIC_SUPABASE_URL is unset: /android/*.apk will not be served');
    }

    return [
      {
        source: '/unlock/:code',
        destination: '/linksnap/unlock/:code',
      },
      ...(storage
        ? [
            {
              source: '/android/:file(.*\\.apk)',
              destination: `${storage}/storage/v1/object/public/android/:file`,
            },
          ]
        : []),
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
            // `camera=(self)` is what the Scanner needs (ADR-0035) and
            // `microphone=(self)` is what a chat voice note needs (ADR-0127):
            // the composer calls `getUserMedia({ audio: true })`, and the empty
            // allowlist (`microphone=()`) refused it in every browser and in the
            // shell's own WebView, which reads the same header. `self`, never
            // `*`: a wildcard would let any third-party frame we ever embed
            // borrow a visitor's camera or microphone. Nothing else is granted.
            value: 'camera=(self), microphone=(self), geolocation=(), payment=()',
          },
        ],
      },
      // The feed is the member's own rows (`app/community/page.tsx` is
      // `force-dynamic`), so it must never reach a shared cache. The old rule
      // here was `public, s-maxage=300` over all of `/community/:path*`, which
      // matched the feed itself: harmless only while nothing cached HTML at the
      // edge, and a cross-member leak the moment something did (ADR-0175).
      //
      // `/community/explore` and `/community/[slug]` are public and keep the
      // cache headers their own pages declare, so they are deliberately absent
      // here — a config rule would only override them.
      {
        source: '/community',
        headers: [{ key: 'Cache-Control', value: 'private, no-store' }],
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
      // The vendored Tafsir (#320): every URL the reader asks for carries
      // `?v=<sha256 first 8>` of the file it names, so a re-vendor is a new key in
      // every cache rather than a stale body, and the bytes never change under a
      // given version.
      {
        source: '/quran/tafsir/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
      // The service worker and the three files it imports must never be served
      // stale: a browser holding an old `/sw.js` keeps running the old worker
      // until every tab closes. These lived in `vercel.json` while Vercel was
      // the only host; they are here now because a header has to be declared
      // where the server that sends it reads it, and this file is what every
      // host we run on reads (ADR-0174). One definition, never two: a duplicate
      // in `vercel.json` produced conflicting `Cache-Control` values.
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
      {
        source: '/sw-version.js',
        headers: [{ key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' }],
      },
      {
        source: '/sw-push-config.js',
        headers: [{ key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' }],
      },
      {
        source: '/sw-precache.js',
        headers: [{ key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' }],
      },
      // A version's bytes never change, and the filename carries the version, so a
      // repeat download can be served from the edge without revalidating and
      // without ever handing out the wrong file. Same pattern as the rewrite in
      // `rewrites()`; the manifest at `/android/latest.json` is deliberately not
      // covered — it has to be re-read every time.
      {
        source: '/android/:file(.*\\.apk)',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
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

// Uploads need all three, not just the token: the plugin fails the build when a
// token is present but the org or project is blank, and the build host where
// that happens (Render) is the one nobody can rebuild by hand.
const sentryUpload = Boolean(
  process.env.SENTRY_AUTH_TOKEN && process.env.SENTRY_ORG && process.env.SENTRY_PROJECT
);

const sentryWebpackPluginOptions = {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  // Name releases after the deploy the app itself reports
  // (`<semver>+build.<count>.<sha>`), so uploaded sourcemaps and the events
  // they describe reference one release. See `sentryRelease` above.
  release: sentryRelease(),
  silent: true,
  dryRun: !sentryUpload,
  // Source maps are only useful if they are uploaded. Without the credentials
  // there is nothing to upload, so skip generating them (`.next/server` was 77%
  // maps on a local build) — those bytes otherwise land in every deployment's
  // payload. With them, upload then delete the maps from the output.
  sourcemaps: sentryUpload ? { deleteSourcemapsAfterUpload: true } : { disable: true },
  // Client events are tunnelled through `/monitoring`, one server request per
  // event on whichever host serves the site (the CSP forbids direct sentry.io
  // calls, so the tunnel stays). Keeping it cheap is a sampling problem — see
  // the client trace rate in frontend/shared/sentry.ts.
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

// The plugin is not Vercel-specific: it builds the `/monitoring` tunnel and
// uploads the source maps, and Render runs the result on `next start` where the
// tunnel rewrite is served like any other. Skipping it there left the client SDK
// posting to `ingest.sentry.io`, which `connect-src` blocks (#1373).
const sentryBuildHost = process.env.VERCEL === '1' || Boolean(process.env.RENDER);
module.exports = sentryBuildHost
  ? withSentryConfig(withBundleAnalyzer(nextConfig), sentryWebpackPluginOptions)
  : withBundleAnalyzer(nextConfig);
