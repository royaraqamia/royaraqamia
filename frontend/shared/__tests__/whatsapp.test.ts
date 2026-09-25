import { describe, it, expect } from 'vitest';
import { whatsappHref } from '@/frontend/shared/whatsapp';

describe('whatsappHref', () => {
  it('reduces the number to digits', () => {
    expect(whatsappHref('+963 968-478-904')).toBe('https://wa.me/963968478904');
  });

  it('URL-encodes the prefilled message', () => {
    const message = 'مرحبًا أحمد، بخصوص طلبكم رقم PRJ-2026-A7K2M9QX.';

    expect(whatsappHref('+963968478904', message)).toBe(
      `https://wa.me/963968478904?text=${encodeURIComponent(message)}`
    );
  });

  it('omits the text parameter when there is no message', () => {
    expect(whatsappHref('963968478904')).toBe('https://wa.me/963968478904');
    expect(whatsappHref('963968478904', '')).toBe('https://wa.me/963968478904');
  });
});
