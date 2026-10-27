import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    include: ['**/*.test.{ts,tsx,mjs}'],
    // 258 jsdom files run across ~7 forked workers, so on an 8-core box a file's
    // first case competes for CPU with environment boot and module transform in
    // six other workers. Vitest's own fix for the repetition it reports ("jsdom
    // was created 258 times") is unavailable here: `pool: 'vmThreads'` crashes
    // Next's require-hook in backend/middleware/__tests__/proxy-matcher.test.ts,
    // and `isolate: false` leaks state across files (129 tests in 39 files fail).
    // A realistic ceiling keeps a starved-but-correct test from being reported as
    // a hang, while a genuinely stuck one still fails. See #194.
    testTimeout: 20_000,
    env: {
      NEXT_PUBLIC_WHATSAPP_PHONE: '963968478904',
      NEXT_PUBLIC_VAPID_PUBLIC_KEY: 'test-public-key',
    },
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'html', 'json-summary'],
      reportsDirectory: './coverage',
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, '.'),
      // Next resolves `server-only` at build time; it is not an installed
      // package, so tests that load a server module need the empty marker.
      'server-only': path.resolve(import.meta.dirname, 'vitest.server-only.ts'),
    },
  },
  define: {
    // The bundled-surface build's build-time constants (`vite.config.ts`). Tests
    // load `app-native/**` through the same code, so the values are defined here
    // without being secrets: the Supabase URL and anon key are public.
    __SPIKE_SUPABASE_URL__: JSON.stringify('https://supabase.test'),
    __SPIKE_SUPABASE_ANON_KEY__: JSON.stringify('test-anon-key'),
  },
});
