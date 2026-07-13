import { describe, it, expect } from 'vitest';
import { WHATSAPP_PHONE, getWhatsAppUrl, getWhatsAppNumber } from '../constants';

describe('constants', () => {
  it('WHATSAPP_PHONE should be the configured number', () => {
    expect(WHATSAPP_PHONE).toBe('963968478904');
  });

  it('getWhatsAppUrl should return a valid whatsapp link', () => {
    const url = getWhatsAppUrl();
    expect(url).toContain('https://wa.me/');
    expect(url).toContain(WHATSAPP_PHONE);
  });

  it('getWhatsAppNumber should return formatted number', () => {
    const num = getWhatsAppNumber();
    expect(num).toBe('+963 968 478 904');
  });
});
