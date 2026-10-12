import { describe, expect, it } from 'vitest';
import {
  SCAN_MAX_PAYLOAD_LENGTH,
  SCAN_PREVIEW_LENGTH,
  certificateCodeFromPayload,
  classifyScanPayload,
  contactName,
  parseOtpPayload,
  parseWifiPayload,
  truncateForDisplay,
} from '@/shared/contracts/scan';

const ORIGIN = 'https://royaraqamia.com';

describe('classifyScanPayload', () => {
  it('reports the host a link actually reaches, not just the payload', () => {
    const result = classifyScanPayload(`${ORIGIN}/verify/COMP-2026-UHVW9SG5`);

    expect(result.kind).toBe('link');
    expect(result.host).toBe('royaraqamia.com');
    expect(result.actionHref).toBe(`${ORIGIN}/verify/COMP-2026-UHVW9SG5`);
    expect(result.actionLabel).toBe('فتح الرَّابط');
    expect(result.deceptive).toBe(false);
  });

  it('flags embedded user-info, which is how a familiar domain is impersonated', () => {
    const result = classifyScanPayload('https://royaraqamia.com@evil.example/verify');

    expect(result.kind).toBe('link');
    expect(result.host).toBe('evil.example');
    expect(result.deceptive).toBe(true);
  });

  it('flags a punycode host', () => {
    expect(classifyScanPayload('https://xn--royaraqamia-9bb.example/').deceptive).toBe(true);
    expect(classifyScanPayload('https://xn--e1afmkfd.example/').deceptive).toBe(true);
  });

  it('offers no open action for a script payload', () => {
    const result = classifyScanPayload('javascript:alert(document.cookie)');

    expect(result.kind).toBe('text');
    expect(result.actionHref).toBeNull();
    expect(result.refusedScheme).toBe('javascript:');
  });

  it('offers no open action for data: or file: payloads either', () => {
    expect(classifyScanPayload('data:text/html,<script>alert(1)</script>').refusedScheme).toBe(
      'data:'
    );
    expect(classifyScanPayload('file:///C:/Windows/System32/calc.exe').refusedScheme).toBe('file:');
  });

  it('keeps plain text plain, trimmed', () => {
    const result = classifyScanPayload('  مرحبًا بالعالم  ');

    expect(result.kind).toBe('text');
    expect(result.value).toBe('مرحبًا بالعالم');
    expect(result.actionHref).toBeNull();
  });

  it('reads a wifi payload, including a separator escaped inside the password', () => {
    const result = classifyScanPayload('WIFI:T:WPA;S:My\\;Net;P:p\\:ass;H:true;;');

    expect(result.kind).toBe('wifi');
    expect(result.wifi).toEqual({
      ssid: 'My;Net',
      password: 'p:ass',
      encryption: 'WPA',
      hidden: true,
    });
    expect(result.actionHref).toBeNull();
  });

  it('reads mailto, tel, sms and geo payloads as their own kinds', () => {
    expect(classifyScanPayload('mailto:hi@example.com').kind).toBe('email');
    expect(classifyScanPayload('tel:+963968478904').kind).toBe('phone');
    expect(classifyScanPayload('sms:+963968478904').kind).toBe('sms');
    expect(classifyScanPayload('geo:33.5138,36.2765').kind).toBe('location');
  });

  it('reads an otpauth payload without inventing a live code', () => {
    const result = classifyScanPayload(
      'otpauth://totp/Royaraqamia:ahm%40example.com?secret=ABCDEF&issuer=Royaraqamia'
    );

    expect(result.kind).toBe('otp');
    expect(result.otp).toEqual({
      type: 'totp',
      label: 'ahm@example.com',
      issuer: 'Royaraqamia',
      secret: 'ABCDEF',
    });
  });

  it('reads a vCard and finds its display name', () => {
    const result = classifyScanPayload('BEGIN:VCARD\nVERSION:3.0\nFN:Ayham Ali\nEND:VCARD');

    expect(result.kind).toBe('contact');
    expect(contactName(result.value)).toBe('Ayham Ali');
  });

  it('caps an absurd payload instead of rendering it', () => {
    const result = classifyScanPayload('x'.repeat(SCAN_MAX_PAYLOAD_LENGTH + 100));

    expect(result.value.length).toBe(SCAN_MAX_PAYLOAD_LENGTH);
  });
});

describe('truncateForDisplay', () => {
  it('leaves a short payload alone and marks a long one', () => {
    expect(truncateForDisplay('short')).toBe('short');
    const long = truncateForDisplay('y'.repeat(SCAN_PREVIEW_LENGTH + 10));
    expect(long.endsWith('…')).toBe(true);
    expect(long.length).toBe(SCAN_PREVIEW_LENGTH + 1);
  });
});

describe('parseWifiPayload', () => {
  it('returns null when there is no SSID to join', () => {
    expect(parseWifiPayload('WIFI:T:WPA;P:secret;;')).toBeNull();
  });
});

describe('parseOtpPayload', () => {
  it('returns null without a secret', () => {
    expect(parseOtpPayload('otpauth://totp/Example?issuer=Example')).toBeNull();
  });
});

describe('certificateCodeFromPayload', () => {
  it('recognises our own verification link, in either case and with a trailing slash', () => {
    expect(certificateCodeFromPayload(`${ORIGIN}/verify/COMP-2026-UHVW9SG5`, ORIGIN)).toBe(
      'COMP-2026-UHVW9SG5'
    );
    expect(certificateCodeFromPayload(`${ORIGIN}/verify/comp-2026-uhvw9sg5/`, ORIGIN)).toBe(
      'COMP-2026-UHVW9SG5'
    );
  });

  it("refuses a lookalike origin, so a stranger's link never renders our card", () => {
    expect(
      certificateCodeFromPayload('https://evil.example/verify/COMP-2026-UHVW9SG5', ORIGIN)
    ).toBeNull();
  });

  it('ignores a malformed code and another path', () => {
    expect(certificateCodeFromPayload(`${ORIGIN}/verify/NOT-A-CODE`, ORIGIN)).toBeNull();
    expect(certificateCodeFromPayload(`${ORIGIN}/community/COMP-2026-UHVW9SG5`, ORIGIN)).toBeNull();
    expect(certificateCodeFromPayload('COMP-2026-UHVW9SG5', ORIGIN)).toBeNull();
  });
});
