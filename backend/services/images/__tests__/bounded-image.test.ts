import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

import { prepareBoundedImage } from '@/backend/services/images/bounded-image';
import { IMAGE_MAX_EDGE_PX, IMAGE_MAX_PIXELS } from '@/shared/contracts/images';

function fileOf(bytes: Uint8Array, name = 'cover.png', type = 'image/png'): File {
  return new File([new Uint8Array(bytes)], name, { type });
}

async function flatPng(width: number, height: number): Promise<Uint8Array> {
  return sharp({
    create: { width, height, channels: 3, background: '#334155' },
  })
    .png()
    .toBuffer();
}

describe('prepareBoundedImage', () => {
  it('re-encodes an accepted upload to a bounded edge', async () => {
    const result = await prepareBoundedImage(fileOf(await flatPng(3000, 2000)));

    expect(result.accepted).toBe(true);
    if (!result.accepted) return;
    expect(result.pixels).toBe(6_000_000);
    expect(result.file.type).toBe('image/webp');
    expect(result.file.name).toBe('cover.webp');

    const metadata = await sharp(new Uint8Array(await result.file.arrayBuffer())).metadata();
    expect(Math.max(metadata.width ?? 0, metadata.height ?? 0)).toBeLessThanOrEqual(
      IMAGE_MAX_EDGE_PX
    );
  });

  it('refuses a small file whose pixels are over the ceiling', async () => {
    // 12,004,000 px as a flat PNG is well under the 5 MB byte cap.
    const bytes = await flatPng(4000, 3001);
    expect(bytes.byteLength).toBeLessThan(5 * 1024 * 1024);
    expect(4000 * 3001).toBeGreaterThan(IMAGE_MAX_PIXELS);

    await expect(prepareBoundedImage(fileOf(bytes))).resolves.toEqual({
      accepted: false,
      reason: 'pixels',
    });
  });

  it('refuses bytes that are not an image at all', async () => {
    await expect(prepareBoundedImage(fileOf(new Uint8Array([1, 2, 3, 4])))).resolves.toEqual({
      accepted: false,
      reason: 'unreadable',
    });
  });
});
