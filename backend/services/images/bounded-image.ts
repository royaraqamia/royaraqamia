import sharp from 'sharp';

import {
  IMAGE_ENCODE_QUALITY,
  IMAGE_MAX_EDGE_PX,
  IMAGE_MAX_PIXELS,
} from '@/shared/contracts/images';
import { withImageDecodeSlot } from '@/backend/services/images/decode-slot';

/**
 * What an upload becomes before it reaches Storage (#1787). The bytes are
 * always a web-sized derivative, whatever the member sent. A file whose
 * *pixels* are over the ceiling is refused even when its bytes are small.
 */
export type PreparedImage =
  | { accepted: true; file: File; pixels: number }
  | { accepted: false; reason: 'pixels' | 'unreadable' };

/**
 * Check the dimensions in the header, then re-encode inside the decode slot.
 *
 * `metadata()` reads the header only: a 200 KB 64 MP PNG is rejected on its
 * dimensions, before libvips is asked to materialise 244 MiB of it. The
 * re-encode keeps a GIF animation animated; everything else becomes WebP, so
 * the object `next/image` later decodes is bounded by the max edge.
 */
export async function prepareBoundedImage(
  file: File,
  maxPixels: number = IMAGE_MAX_PIXELS
): Promise<PreparedImage> {
  const bytes = new Uint8Array(await file.arrayBuffer());

  let width: number | undefined;
  let height: number | undefined;
  let pages: number | undefined;
  try {
    ({ width, height, pages } = await sharp(bytes, { limitInputPixels: false }).metadata());
  } catch {
    return { accepted: false, reason: 'unreadable' };
  }

  if (!width || !height) return { accepted: false, reason: 'unreadable' };

  const pixels = width * height;
  if (pixels > maxPixels) return { accepted: false, reason: 'pixels' };

  const animated = file.type === 'image/gif' && (pages ?? 1) > 1;
  const pipeline = sharp(bytes, { limitInputPixels: maxPixels, animated }).rotate().resize({
    width: IMAGE_MAX_EDGE_PX,
    height: IMAGE_MAX_EDGE_PX,
    fit: 'inside',
    withoutEnlargement: true,
  });

  try {
    const encoded = await withImageDecodeSlot(() =>
      (animated ? pipeline.gif() : pipeline.webp({ quality: IMAGE_ENCODE_QUALITY })).toBuffer()
    );
    const extension = animated ? 'gif' : 'webp';
    const base = file.name.replace(/\.[^.]+$/, '');
    const bounded = new File([encoded], `${base}.${extension}`, {
      type: animated ? 'image/gif' : 'image/webp',
    });
    return { accepted: true, file: bounded, pixels };
  } catch {
    return { accepted: false, reason: 'unreadable' };
  }
}
