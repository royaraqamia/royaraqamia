import { createHash } from 'node:crypto';

import sharp from 'sharp';

import {
  IMAGE_ENCODE_QUALITY,
  IMAGE_MAX_EDGE_PX,
  IMAGE_MAX_PIXELS,
  IMAGE_SOURCE_MAX_BYTES,
} from '@/shared/contracts/images';
import { withImageDecodeSlot } from '@/backend/services/images/decode-slot';

/**
 * The decode path for the images the site stores (covers and avatars).
 *
 * `next/image` normally sends these to Next's built-in optimizer, which has no
 * hook for a process-wide slot. The community cards instead use a loader that
 * points here: the source is downloaded from Storage, checked against the same
 * pixel ceiling the uploads enforce, and decoded one at a time. Images from
 * any other host keep the built-in optimizer, which is bounded separately by
 * `experimental.imgOptMaxInputPixels` in `next.config.js`.
 */

export type OptimizedImage =
  | { ok: true; bytes: Uint8Array; contentType: string; etag: string; passthrough: boolean }
  | { ok: false; status: 400 | 502 };

export interface OptimizeRequest {
  src: string;
  width: number;
  quality: number;
  accept: string;
}

/** A width the browser asked for, clamped to the max edge we ever encode. */
function boundedWidth(width: number): number {
  if (!Number.isFinite(width) || width <= 0) return IMAGE_MAX_EDGE_PX;
  return Math.min(Math.floor(width), IMAGE_MAX_EDGE_PX);
}

function boundedQuality(quality: number): number {
  if (!Number.isFinite(quality) || quality <= 0) return IMAGE_ENCODE_QUALITY;
  return Math.min(Math.max(Math.floor(quality), 1), 100);
}

export async function optimizeImage({
  src,
  width,
  quality,
  accept,
}: OptimizeRequest): Promise<OptimizedImage> {
  // Storage is the only source this optimizer may fetch. The check is inline
  // so the tainted request URL is visibly bounded to HTTPS on our bucket host
  // before it reaches fetch, not routed through a helper.
  let source: URL;
  try {
    const parsed = new URL(src);
    if (
      parsed.protocol !== 'https:' ||
      !(parsed.hostname === 'supabase.co' || parsed.hostname.endsWith('.supabase.co'))
    ) {
      return { ok: false, status: 400 };
    }
    source = parsed;
  } catch {
    return { ok: false, status: 400 };
  }

  let response: Response;
  try {
    response = await fetch(source.href, {
      headers: { Accept: 'image/avif,image/webp,image/*' },
      signal: AbortSignal.timeout(7_000),
    });
  } catch {
    return { ok: false, status: 502 };
  }

  if (!response.ok) return { ok: false, status: 502 };

  const declared = response.headers.get('content-length');
  if (declared && Number(declared) > IMAGE_SOURCE_MAX_BYTES) return { ok: false, status: 502 };

  const bytes = new Uint8Array(await response.arrayBuffer());
  const contentType = response.headers.get('content-type')?.split(';')[0]?.trim() ?? '';
  if (bytes.byteLength > IMAGE_SOURCE_MAX_BYTES || !contentType.startsWith('image/')) {
    return { ok: false, status: 502 };
  }

  let pixelWidth: number | undefined;
  let pixelHeight: number | undefined;
  try {
    ({ width: pixelWidth, height: pixelHeight } = await sharp(bytes, {
      limitInputPixels: false,
    }).metadata());
  } catch {
    return { ok: false, status: 502 };
  }

  if (!pixelWidth || !pixelHeight) return { ok: false, status: 502 };

  // Images stored before this cap landed may be larger. Serving the original
  // keeps them visible without asking libvips to allocate their pixels.
  if (pixelWidth * pixelHeight > IMAGE_MAX_PIXELS) {
    return {
      ok: true,
      bytes,
      contentType,
      etag: etagOf(bytes),
      passthrough: true,
    };
  }

  const target = boundedWidth(width);
  const q = boundedQuality(quality);
  const pipeline = sharp(bytes, { limitInputPixels: IMAGE_MAX_PIXELS, sequentialRead: true })
    .rotate()
    .resize({ width: target, height: target, fit: 'inside', withoutEnlargement: true });

  let output;
  let outputType;
  if (accept.includes('image/avif')) {
    output = pipeline.avif({ quality: Math.max(Math.round(q * (50 / 80)), 1), effort: 3 });
    outputType = 'image/avif';
  } else if (accept.includes('image/webp')) {
    output = pipeline.webp({ quality: q });
    outputType = 'image/webp';
  } else {
    output = pipeline.jpeg({ quality: q, mozjpeg: true });
    outputType = 'image/jpeg';
  }

  try {
    const encoded = await withImageDecodeSlot(() => output.toBuffer());
    return {
      ok: true,
      bytes: encoded,
      contentType: outputType,
      etag: etagOf(encoded),
      passthrough: false,
    };
  } catch {
    return { ok: false, status: 502 };
  }
}

function etagOf(bytes: Uint8Array): string {
  return `W/"${createHash('sha256').update(bytes).digest('hex').slice(0, 16)}"`;
}
