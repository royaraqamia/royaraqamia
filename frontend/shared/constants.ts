export const WHATSAPP_PHONE =
  process.env.NEXT_PUBLIC_WHATSAPP_PHONE ??
  (() => {
    throw new Error('Missing required env var: NEXT_PUBLIC_WHATSAPP_PHONE');
  })();

export const WHATSAPP_MESSAGE = 'السَّلام عليكم ورحمة اللّٰه وبركاته.';

export const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? '';

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';

export const SUPABASE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';

export const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? '';

export const APP_BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? '';

export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://royaraqamia.com';

/**
 * Single source of truth for the canonical origin (scheme + host, no trailing
 * slash or path). Consumed by `metadataBase`, the sitemap, and robots.txt so
 * every canonical surface agrees on one URL.
 */
export function getCanonicalOrigin(): string {
  try {
    return new URL(SITE_URL).origin;
  } catch {
    return 'https://royaraqamia.com';
  }
}

/** Single source of truth for text direction; consumed by `<html dir>` and Radix's DirectionProvider. */
export const DIRECTION = 'rtl' as const;

export const IS_DEVELOPMENT = process.env.NODE_ENV === 'development';
export const IS_PRODUCTION = process.env.NODE_ENV === 'production';

export function getWhatsAppUrl(message: string = WHATSAPP_MESSAGE): string {
  return `https://wa.me/${WHATSAPP_PHONE}?text=${encodeURIComponent(message)}`;
}
