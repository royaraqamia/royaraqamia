/**
 * A WhatsApp deep link for a phone number the Admin is replying to. The number
 * is reduced to digits because `wa.me` rejects spaces and punctuation, and the
 * message is URL-encoded so a Client's name or a Reference Code cannot break the
 * link. Omitting the message opens the chat with nothing prefilled.
 */
export function whatsappHref(phone: string, message?: string): string {
  const base = `https://wa.me/${phone.replace(/\D/g, '')}`;
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
}
