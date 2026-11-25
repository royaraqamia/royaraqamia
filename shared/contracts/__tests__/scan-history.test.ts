import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { classifyScanPayload, type ScanResultKind } from '@/shared/contracts/scan';
import {
  SCAN_HISTORY_KINDS,
  SCAN_HISTORY_LABEL_MAX,
  ScanHistoryRecordSchema,
  normalizeFormat,
  scanHistoryRecord,
} from '@/shared/contracts/scan-history';

/**
 * The tests that matter here are the ones that try to leak (ADR-0205).
 *
 * A summary is only worth having if the thing it summarises cannot travel with
 * it, so every case below feeds a payload that carries a real secret — a Wi-Fi
 * password, an OTP seed, a signed URL, a person's address — and asserts the row
 * built from it does not contain it. The last block makes the same claim about
 * the route: a body that names a payload field is refused, not trimmed.
 */

function record(payload: string, format = 'qr_code') {
  return scanHistoryRecord(classifyScanPayload(payload), format);
}

/** `kindLink` -> `link`: the nine kinds the one copy source writes (#1789). */
function copyKinds(): string[] {
  const source = JSON.parse(
    readFileSync(join(process.cwd(), 'shared', 'copy', 'scan.json'), 'utf8')
  ) as { strings: Record<string, string> };
  return Object.keys(source.strings)
    .filter((key) => /^kind[A-Z]/.test(key))
    .map((key) => key.charAt(4).toLowerCase() + key.slice(5))
    .sort();
}

describe('scanHistoryRecord', () => {
  it("speaks the Scanner's own vocabulary, one kind per copied label", () => {
    expect([...SCAN_HISTORY_KINDS].sort()).toEqual(copyKinds());
  });

  it('keeps the host of a link and nothing else', () => {
    const row = record('https://cafe.example/menu?table=4&token=abc123');

    expect(row).toEqual({ kind: 'link', format: 'qr_code', label: 'cafe.example' });
  });

  it('keeps the domain of an email, not the person', () => {
    expect(record('mailto:khaled@example.test?subject=hi').label).toBe('example.test');
  });

  it('masks a phone number to its last three digits', () => {
    expect(record('tel:+963999123456').label).toBe('••• 456');
    expect(record('sms:+963999123456?body=hello').label).toBe('••• 456');
  });

  it('keeps a Wi-Fi network name and never its password', () => {
    const row = record('WIFI:T:WPA;S:CafeGuest;P:hunter2-secret;;');

    expect(row.kind).toBe('wifi');
    expect(row.label).toBe('CafeGuest');
    expect(JSON.stringify(row)).not.toContain('hunter2-secret');
  });

  it('keeps a contact name and never the rest of the card', () => {
    const row = record(
      'BEGIN:VCARD\nVERSION:3.0\nFN:Khaled Example\nTEL:+963999123456\nEMAIL:k@example.test\nEND:VCARD'
    );

    expect(row.kind).toBe('contact');
    expect(row.label).toBe('Khaled Example');
    expect(JSON.stringify(row)).not.toContain('+963999123456');
    expect(JSON.stringify(row)).not.toContain('k@example.test');
  });

  it('keeps an OTP issuer and never its secret', () => {
    const row = record('otpauth://totp/GitHub:khaled?secret=JBSWY3DPEHPK3PXP&issuer=GitHub');

    expect(row.kind).toBe('otp');
    expect(row.label).toBe('GitHub');
    expect(JSON.stringify(row)).not.toContain('JBSWY3DPEHPK3PXP');
    expect(JSON.stringify(row)).not.toContain('khaled');
  });

  it('keeps no coordinates and no plain text', () => {
    expect(record('geo:33.5138,36.2765').label).toBeNull();
    expect(record('password=hunter2').label).toBeNull();
  });

  it('never carries the payload it summarises', () => {
    const payloads = [
      'https://user:pw@evil.example/reset?token=abc123',
      'WIFI:T:WPA;S:Home;P:hunter2-secret;;',
      'otpauth://totp/GitHub:khaled?secret=JBSWY3DPEHPK3PXP&issuer=GitHub',
      'BEGIN:VCARD\nVERSION:3.0\nFN:Khaled\nTEL:+963999123456\nEND:VCARD',
      'mailto:khaled@example.test?subject=hi',
      'tel:+963999123456',
      'geo:33.5138,36.2765',
      'password=hunter2',
    ];
    const secrets = [
      'pw',
      'abc123',
      'token',
      '/reset',
      'hunter2',
      'JBSWY3DPEHPK3PXP',
      '+963999123456',
      'khaled',
      '33.5138',
    ];

    for (const payload of payloads) {
      const serialised = JSON.stringify(record(payload));

      for (const secret of secrets) {
        if (secret === 'pw') {
          // `pw` is the URL's user-info, which a host never carries.
          expect(serialised).not.toContain('user:pw');
          continue;
        }
        expect(serialised).not.toContain(secret);
      }
    }
  });

  it("folds the detector's name so one code is one row", () => {
    expect(normalizeFormat('QR_CODE')).toBe('qr_code');
    expect(normalizeFormat('QR-Code')).toBe('qr_code');
    expect(normalizeFormat('  ')).toBe('unknown');
    expect(normalizeFormat('x'.repeat(80))).toHaveLength(32);
  });

  it('bounds a hostile label and folds its control characters', () => {
    const row = record(`https://${'a'.repeat(400)}.example`);

    expect(row.label).toHaveLength(SCAN_HISTORY_LABEL_MAX);
    expect(row.label).not.toMatch(/\p{Cc}/u);
  });
});

describe('ScanHistoryRecordSchema', () => {
  it('accepts the three fields the Scanner sends', () => {
    const parsed = ScanHistoryRecordSchema.safeParse({
      kind: 'wifi',
      format: 'qr_code',
      label: 'CafeGuest',
    });

    expect(parsed.success).toBe(true);
  });

  it('refuses a body that names a payload field', () => {
    const parsed = ScanHistoryRecordSchema.safeParse({
      kind: 'wifi',
      format: 'qr_code',
      label: 'CafeGuest',
      value: 'WIFI:T:WPA;S:CafeGuest;P:hunter2-secret;;',
    });

    expect(parsed.success).toBe(false);
  });

  it('refuses a kind the Scanner does not have, and an unbounded label', () => {
    expect(ScanHistoryRecordSchema.safeParse({ kind: 'card', format: 'qr_code' }).success).toBe(
      false
    );
    expect(
      ScanHistoryRecordSchema.safeParse({
        kind: 'link',
        format: 'qr_code',
        label: 'a'.repeat(SCAN_HISTORY_LABEL_MAX + 1),
      }).success
    ).toBe(false);
  });
});

/**
 * The same fixture the app's `ScanHistorySummaryTest` reads (#1430).
 *
 * The summary is computed on each client, so this is the one place the two
 * implementations can drift. One file of payloads and expected labels, read by
 * both suites, is what turns "the rules match" from a claim into a failure on the
 * pull request that changes one of them.
 */
describe('the shared scan-history fixture', () => {
  interface FixtureCase {
    payload: string;
    format: string;
    nativeFormat: string;
    kind: ScanResultKind;
    label: string | null;
    absent: string[];
  }

  const cases = JSON.parse(
    readFileSync(join(process.cwd(), 'shared', 'fixtures', 'scan-history-labels.json'), 'utf8')
  ) as FixtureCase[];

  it.each(cases)('$kind: $payload', (fixture) => {
    const row = record(fixture.payload, fixture.format);

    expect(row.kind).toBe(fixture.kind);
    expect(row.label).toBe(fixture.label);
    expect(row.format).toBe(normalizeFormat(fixture.nativeFormat));

    for (const secret of fixture.absent) {
      expect(JSON.stringify(row)).not.toContain(secret);
    }
  });
});
