export const WHATSAPP_PHONE =
  process.env.NEXT_PUBLIC_WHATSAPP_PHONE ??
  (() => {
    throw new Error('Missing required env var: NEXT_PUBLIC_WHATSAPP_PHONE');
  })();

export const WHATSAPP_MESSAGE = 'السَّلام عليكم ورحمة اللّٰه وبركاته.';

export const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? '';

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';

export const SUPABASE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';

export const APP_BASE_URL = process.env.NEXT_PUBLIC_APP_URL ?? '';

export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://royaraqamia.com';

export const IS_DEVELOPMENT = process.env.NODE_ENV === 'development';
export const IS_PRODUCTION = process.env.NODE_ENV === 'production';

export function getWhatsAppUrl(message: string = WHATSAPP_MESSAGE): string {
  return `https://wa.me/${WHATSAPP_PHONE}?text=${encodeURIComponent(message)}`;
}

export function getWhatsAppNumber(): string {
  const match = WHATSAPP_PHONE.match(/(\d{3})(\d{3})(\d{3})(\d{3})/);
  if (!match) return WHATSAPP_PHONE;
  return `+${match[1]} ${match[2]} ${match[3]} ${match[4]}`;
}
