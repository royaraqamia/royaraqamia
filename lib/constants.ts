export const WHATSAPP_PHONE = process.env.NEXT_PUBLIC_WHATSAPP_PHONE || '963968478904';

export const WHATSAPP_MESSAGE = 'السَّلام عليكم ورحمة اللّٰه وبركاته.';

export function getWhatsAppUrl(message: string = WHATSAPP_MESSAGE): string {
  return `https://wa.me/${WHATSAPP_PHONE}?text=${encodeURIComponent(message)}`;
}
