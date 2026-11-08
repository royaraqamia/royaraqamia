import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  imageFileName,
  imageTargetSize,
  shrinkChatImage,
} from '@/frontend/ui/chats/image-downscale';

/**
 * The page's half of "the assistant sees an image" (ADR-0139): a picture is a
 * prompt inside the request body, so it is downscaled to 1600 px on its longest
 * side and under 4 MB before it is uploaded — and anything that is not a
 * picture, or a picture the browser cannot decode, goes up as it is.
 */
describe('imageTargetSize', () => {
  it('leaves an image already inside the bound alone', () => {
    expect(imageTargetSize(1200, 800)).toEqual({ width: 1200, height: 800 });
  });

  it('fits a wide picture by its longest side and keeps the shape', () => {
    expect(imageTargetSize(4000, 3000)).toEqual({ width: 1600, height: 1200 });
  });

  it('fits a tall picture by its height', () => {
    expect(imageTargetSize(3000, 4000)).toEqual({ width: 1200, height: 1600 });
  });

  it('refuses dimensions no picture has', () => {
    expect(imageTargetSize(0, 0)).toBeNull();
    expect(imageTargetSize(Number.NaN, 100)).toBeNull();
  });
});

describe('imageFileName', () => {
  it('names the bytes the encoder produced, not the ones it replaced', () => {
    expect(imageFileName('screenshot.png', 'image/webp')).toBe('screenshot.webp');
    expect(imageFileName('IMG_0042', 'image/jpeg')).toBe('IMG_0042.jpg');
  });

  it('leaves a name alone when the encoding kept its type', () => {
    expect(imageFileName('shot.webp', 'application/pdf')).toBe('shot.webp');
  });
});

describe('shrinkChatImage', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  function stubCanvas(encoded: string = 'image/webp') {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage: () => undefined,
      fillRect: () => undefined,
      fillStyle: '',
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (
      this: HTMLCanvasElement,
      callback: BlobCallback,
      type?: string
    ) {
      callback(new Blob([new Uint8Array(2_048)], { type: type ?? encoded }));
    });
  }

  it('returns anything that is not a picture untouched', async () => {
    const decoder = vi.fn();
    vi.stubGlobal('createImageBitmap', decoder);

    const pdf = new File([new Uint8Array(4_096)], 'report.pdf', { type: 'application/pdf' });

    expect(await shrinkChatImage(pdf)).toBe(pdf);
    expect(decoder).not.toHaveBeenCalled();
  });

  it('leaves a small picture at its own bytes', async () => {
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => ({ width: 800, height: 600, close: () => undefined }))
    );
    const small = new File([new Uint8Array(1_024)], 'small.png', { type: 'image/png' });

    expect(await shrinkChatImage(small)).toBe(small);
  });

  it('shrinks a phone photo to a 1600 px WebP', async () => {
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => ({ width: 4000, height: 3000, close: () => undefined }))
    );
    stubCanvas('image/webp');
    const photo = new File([new Uint8Array(9_000_000)], 'photo.png', { type: 'image/png' });

    const shrunk = await shrinkChatImage(photo);

    expect(shrunk).not.toBe(photo);
    expect(shrunk.name).toBe('photo.webp');
    expect(shrunk.type).toBe('image/webp');
    expect(shrunk.size).toBeLessThanOrEqual(4 * 1024 * 1024);
  });

  /**
   * The decoder is the browser's, and it does not know every format a phone
   * writes. A file it refuses goes up as it is: the server's own sentence —
   * "I cannot read this file" — is more use than a composer that swallows it.
   */
  it('returns the file when the browser cannot decode it', async () => {
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => {
        throw new Error('unsupported format');
      })
    );
    const heic = new File([new Uint8Array(5_000_000)], 'IMG_0001.heic', { type: 'image/heic' });

    expect(await shrinkChatImage(heic)).toBe(heic);
  });
});
