import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    include: ['**/*.test.{ts,tsx,mjs}'],
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
});
