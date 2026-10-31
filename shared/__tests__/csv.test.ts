import { describe, it, expect } from 'vitest';
import { escapeCsvLiteral, escapeCsvText } from '@/shared/csv';

describe('escapeCsvText', () => {
  it.each(['+1', '-1', '@SUM(A1)', '=1+1', '\tx'])(
    'defuses a formula lead by apostrophe-prefixing %j',
    (value) => {
      expect(escapeCsvText(value)).toBe(`'${value}`);
    }
  );

  it('defuses a carriage-return lead before quoting it', () => {
    expect(escapeCsvText('\rx')).toBe('"\'\rx"');
  });

  it('still quotes a defused cell that also needs quoting', () => {
    expect(escapeCsvText('=A1,B1')).toBe('"\'=A1,B1"');
    expect(escapeCsvText('=HYPERLINK("https://evil.example","x")')).toBe(
      '"\'=HYPERLINK(""https://evil.example"",""x"")"'
    );
  });

  it('leaves ordinary URLs, Arabic text and empty cells unchanged', () => {
    expect(escapeCsvText('https://example.com/page?a=1&b=2')).toBe(
      'https://example.com/page?a=1&b=2'
    );
    expect(escapeCsvText('قهوة, حليب')).toBe('"قهوة, حليب"');
    expect(escapeCsvText('شراء "قهوة"')).toBe('"شراء ""قهوة"""');
    expect(escapeCsvText(null)).toBe('');
    expect(escapeCsvText(undefined)).toBe('');
    expect(escapeCsvText('')).toBe('');
  });
});

describe('escapeCsvLiteral', () => {
  it('does not defuse a formula lead', () => {
    expect(escapeCsvLiteral('2026-08-01')).toBe('2026-08-01');
    expect(escapeCsvLiteral(-12.5)).toBe('-12.5');
    expect(escapeCsvLiteral('=1+1')).toBe('=1+1');
  });

  it('quotes only what the CSV grammar requires', () => {
    expect(escapeCsvLiteral('a,b')).toBe('"a,b"');
    expect(escapeCsvLiteral(null)).toBe('');
  });
});
