import { createGuardedFetch } from '@/backend/shared/egress';
import { logger } from '@/backend/shared/logger';

/**
 * The icon proxy's only socket.
 *
 * A brand mark is a third-party URL stored on a catalogue row. Fetching it from
 * the member's browser would leak her address to every provider in the store and
 * break the moment a provider blocks hotlinking, so the store asks us instead and
 * this client fetches the bytes once, through `backend/shared/egress`.
 *
 * The allowlist is the point: an icon endpoint that answers HTML or JavaScript is
 * not an icon, and serving it from our origin would make the store a way to host
 * somebody else's document.
 */

/** Mimes the proxy will serve. Mirrors the database's icon-mime constraint. */
const ICON_MIMES = new Set([
  'image/png',
  'image/svg+xml',
  'image/jpeg',
  'image/webp',
  'image/x-icon',
]);

/** A mark is a small file; half a megabyte is generous for a 512px raster. */
const MAX_ICON_BYTES = 512 * 1024;

/** Short enough that a row's image never holds a page, long enough for a slow CDN. */
const ICON_TIMEOUT_MS = 5_000;

export interface McpIcon {
  bytes: Uint8Array;
  mime: string;
}

export interface McpIconClient {
  fetch(url: string): Promise<McpIcon | null>;
}

interface IconClientDependencies {
  fetchImpl?: typeof fetch;
  resolveHost?: (hostname: string) => Promise<Array<{ address: string }>>;
}

export function createMcpIconClient(dependencies: IconClientDependencies = {}): McpIconClient {
  const guardedFetch = createGuardedFetch({
    timeoutMs: ICON_TIMEOUT_MS,
    ...(dependencies.fetchImpl ? { fetchImpl: dependencies.fetchImpl } : {}),
    ...(dependencies.resolveHost ? { resolveHost: dependencies.resolveHost } : {}),
  });

  return {
    async fetch(url) {
      try {
        const response = await guardedFetch(url, { headers: { accept: 'image/*' } });
        if (!response.ok) return null;

        const mime = (response.headers.get('content-type') ?? '')
          .split(';')[0]!
          .trim()
          .toLowerCase();
        if (!ICON_MIMES.has(mime)) return null;

        // `content-length` is a hint; the reader is the ceiling that matters.
        const declared = Number(response.headers.get('content-length') ?? '0');
        if (declared > MAX_ICON_BYTES) return null;

        const bytes = new Uint8Array(await response.arrayBuffer());
        if (bytes.byteLength === 0 || bytes.byteLength > MAX_ICON_BYTES) return null;

        return { bytes, mime };
      } catch (error) {
        // A missing mark is a fallback tile, never a broken store.
        logger.warn('MCP icon: fetch failed', { url, error: String(error) });
        return null;
      }
    },
  };
}
