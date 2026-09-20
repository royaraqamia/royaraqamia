import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Guards the cache-busting contract: every PWA/favicon URL must carry the
 * content-hash `?v=` token so a client's HTTP/PWA/favicon cache can never serve
 * the previous artwork without the user clearing site data. If any of these
 * regress to a bare URL, stale icons silently return.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => readFileSync(resolve(ROOT, p), 'utf8');

describe('PWA asset cache-busting', () => {
  const manifest = JSON.parse(read('public/manifest.json'));
  const version = read('backend/config/generated/asset-version.ts').match(
    /ASSET_VERSION = '([^']+)'/
  )?.[1];

  it('exposes a content-hash asset version', () => {
    expect(version).toMatch(/^[0-9a-f]{10}$/);
  });

  it('versions every manifest icon URL', () => {
    expect(manifest.icons.length).toBeGreaterThan(0);
    for (const icon of manifest.icons) {
      expect(icon.src).toContain(`?v=${version}`);
    }
  });

  it('versions the manifest href, favicon and apple-touch links', () => {
    const layout = read('app/layout.tsx');
    expect(layout).toContain('ASSET_QUERY');
    expect(layout).toContain('/manifest.json${ASSET_QUERY}');
    expect(layout).toContain('/favicon.ico${ASSET_QUERY}');
    expect(layout).toContain('apple-touch-icon-180x180.png${ASSET_QUERY}');
  });

  it('versions the service-worker precache and notification assets', () => {
    const sw = read('public/sw.js');
    expect(sw).toContain('self.ASSET_VERSION');
    expect(sw).toContain('/manifest.json${ASSET_QUERY}');
    expect(sw).toContain('notification-icon-192x192.png${ASSET_QUERY}');
    expect(sw).toContain('badge-icon-96x96.png${ASSET_QUERY}');
  });

  it('forces revalidation of the manifest and the service-worker config scripts', () => {
    expect(read('next.config.js')).toContain("source: '/manifest.json'");
    const vercel = read('vercel.json');
    expect(vercel).toContain('/sw-version.js');
    expect(vercel).toContain('/sw-push-config.js');
  });
});
