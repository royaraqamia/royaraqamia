export const WHATSAPP_PHONE =
  process.env.NEXT_PUBLIC_WHATSAPP_PHONE ??
  (() => {
    throw new Error('Missing required env var: NEXT_PUBLIC_WHATSAPP_PHONE');
  })();

export const WHATSAPP_MESSAGE = 'السَّلام عليكم ورحمة اللّٰه وبركاته.';

export function getWhatsAppUrl(message: string = WHATSAPP_MESSAGE): string {
  return `https://wa.me/${WHATSAPP_PHONE}?text=${encodeURIComponent(message)}`;
}

export function getWhatsAppNumber(): string {
  const match = WHATSAPP_PHONE.match(/(\d{3})(\d{3})(\d{3})(\d{3})/);
  if (!match) return WHATSAPP_PHONE;
  return `+${match[1]} ${match[2]} ${match[3]} ${match[4]}`;
}
