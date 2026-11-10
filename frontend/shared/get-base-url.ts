import { APP_BASE_URL } from '@/frontend/shared/constants';

export function getBaseUrl(): string {
  if (typeof window !== 'undefined') {
    return window.location.origin;
  }
  return APP_BASE_URL;
}

/**
 * The origin a member reads, without its scheme: `royaraqamia.com`.
 *
 * A slug field shows where the short link lives, not how to type a URL, and
 * `https://` is twelve characters of noise in front of the part the member is
 * editing. The full URL stays what copy and share hand to the clipboard.
 */
export function getBaseHost(): string {
  return getBaseUrl().replace(/^https?:\/\//, '');
}
