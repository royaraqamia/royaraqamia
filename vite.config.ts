/**
 * The packaged-surface build (issue #500).
 *
 * Next builds the site; this builds the one owned surface the spike bundles
 * into the APK: `app-native/habitflow/` mounts the *same* components
 * (`frontend/ui/habitflow/**`), with `next/*` resolving to the stubs in
 * `app-native/habitflow/next-shims/`. The output is a static document Capacitor
 * serves as `https://localhost/`.
 *
 * This config is separate from `vitest.config.mts` and from Next's build on
 * purpose: nothing in the deployed site reads it, and `vite build` (via
 * `npm run spike:build`) is the only entry point.
 */

import { resolve } from 'node:path';

import { defineConfig, loadEnv } from 'vite';

const ROOT = process.cwd();
const SHIMS = resolve(ROOT, 'app-native/habitflow/next-shims');

export default defineConfig(({ mode }) => {
  // The site's own env files: the two Supabase values are public (`NEXT_PUBLIC_*`
  // ships in every browser bundle) and the spike needs them to mint a token.
  const env = loadEnv(mode, ROOT, '');

  /**
   * Next inlines `process.env.NEXT_PUBLIC_*` at build time; Vite does not read
   * those names at all. The bundled surface touches the same config module, so
   * every public value is inlined here, with the two the build cannot start
   * without defaulted to the fixtures the test config uses.
   */
  const publicEnv: Record<string, string> = {
    NEXT_PUBLIC_WHATSAPP_PHONE: '963968478904',
    NEXT_PUBLIC_VAPID_PUBLIC_KEY: 'spike-no-push',
  };
  for (const [key, value] of Object.entries(env)) {
    if (key.startsWith('NEXT_PUBLIC_')) publicEnv[key] = value;
  }

  return {
    root: resolve(ROOT, 'app-native/habitflow'),
    // The full `public/` tree: fonts (declared by `app/global.css`), icons and
    // the manifest are the same assets the site serves, so the bundled document
    // renders against FOUT-free faces. The service worker it carries is never
    // registered — this document is the APK's, not a cached one (#503).
    publicDir: resolve(ROOT, 'public'),
    build: {
      // The WebView floor `capacitor.config.ts` states.
      target: 'chrome111',
      outDir: resolve(ROOT, 'capacitor-web/spike'),
      emptyOutDir: true,
      sourcemap: false,
    },
    resolve: {
      alias: [
        // `next/*` modules the bundled components import at runtime. Server-side
        // modules are not aliased: a component that needs one cannot be bundled
        // as-is, and the build failing is the right answer.
        { find: /^next\/navigation$/, replacement: resolve(SHIMS, 'navigation.tsx') },
        { find: /^next\/link$/, replacement: resolve(SHIMS, 'link.tsx') },
        { find: /^next\/image$/, replacement: resolve(SHIMS, 'image.tsx') },
        { find: /^next\/dynamic$/, replacement: resolve(SHIMS, 'dynamic.tsx') },
        // `tsconfig.json`'s `@/*` path.
        { find: /^@\//, replacement: `${ROOT}/` },
      ],
    },
    esbuild: {
      jsx: 'automatic',
    },
    define: {
      __SPIKE_SUPABASE_URL__: JSON.stringify(env.NEXT_PUBLIC_SUPABASE_URL ?? ''),
      __SPIKE_SUPABASE_ANON_KEY__: JSON.stringify(env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? ''),
      ...Object.fromEntries(
        Object.entries(publicEnv).map(([key, value]) => [
          `process.env.${key}`,
          JSON.stringify(value),
        ])
      ),
      'process.env.NODE_ENV': JSON.stringify('production'),
    },
  };
});
