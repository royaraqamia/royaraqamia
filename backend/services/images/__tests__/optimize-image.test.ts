import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { imageDecodeStats } from '@/backend/services/images/decode-slot';
import { optimizeImage } from '@/backend/services/images/optimize-image';
import { IMAGE_MAX_EDGE_PX } from '@/shared/contracts/images';

const SOURCE = 'https://example.supabase.co/storage/v1/object/public/post-images/u/cover.png';

function stubSource(bytes: Uint8Array) {
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () => new Response(new Uint8Array(bytes), { headers: { 'content-type': 'image/png' } })
    )
  );
}

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('optimizeImage', () => {
  it('only fetches images from Storage', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    for (const src of [
      'https://evil.example/cover.png',
      'http://example.supabase.co/cover.png',
      'https://other.supabase.co/cover.png',
      'https://example.supabase.co.evil.test/cover.png',
      'not a url',
    ]) {
      await expect(
        optimizeImage({ src, width: 576, quality: 75, accept: 'image/webp' })
      ).resolves.toEqual({ ok: false, status: 400 });
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('holds at most one decode for two concurrent first hits', async () => {
    const bytes = await sharp({
      create: { width: 3000, height: 2000, channels: 3, background: '#0f172a' },
    })
      .png()
      .toBuffer();
    stubSource(bytes);

    const [first, second] = await Promise.all([
      optimizeImage({ src: SOURCE, width: 576, quality: 75, accept: 'image/webp' }),
      optimizeImage({ src: SOURCE, width: 1200, quality: 75, accept: 'image/webp' }),
    ]);

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(imageDecodeStats().peak).toBe(1);
    expect(imageDecodeStats().active).toBe(0);

    if (first.ok) {
      expect(first.contentType).toBe('image/webp');
      expect(first.passthrough).toBe(false);
      const metadata = await sharp(new Uint8Array(first.bytes)).metadata();
      expect(Math.max(metadata.width ?? 0, metadata.height ?? 0)).toBeLessThanOrEqual(
        IMAGE_MAX_EDGE_PX
      );
    }
  });

  it('answers with the source it did not decode when the pixels exceed the ceiling', async () => {
    const bytes = await sharp({
      create: { width: 4000, height: 3001, channels: 3, background: '#0f172a' },
    })
      .png()
      .toBuffer();
    stubSource(bytes);

    const result = await optimizeImage({
      src: SOURCE,
      width: 576,
      quality: 75,
      accept: 'image/webp',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.passthrough).toBe(true);
      expect(result.contentType).toBe('image/png');
      expect(result.bytes.byteLength).toBe(bytes.byteLength);
    }
  });
});
