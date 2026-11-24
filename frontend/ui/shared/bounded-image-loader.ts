import type { ImageLoaderProps } from 'next/image';

/**
 * Send stored images through the slot-guarded optimizer instead of Next's
 * built-in one. Other sources — local fixtures, for example — keep the default
 * optimizer, untouched (#1787).
 */
export function boundedImageLoader({ src, width, quality }: ImageLoaderProps): string {
  const q = String(quality ?? 75);
  let fromStorage: boolean;
  try {
    const url = new URL(src, 'http://localhost');
    fromStorage =
      url.protocol === 'https:' &&
      (url.hostname === 'supabase.co' || url.hostname.endsWith('.supabase.co'));
  } catch {
    fromStorage = false;
  }

  if (!fromStorage) {
    return `/_next/image?url=${encodeURIComponent(src)}&w=${width}&q=${q}`;
  }

  const params = new URLSearchParams({ url: src, w: String(width), q });
  return `/api/media/optimize?${params.toString()}`;
}
