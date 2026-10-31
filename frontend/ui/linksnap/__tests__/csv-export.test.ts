import { describe, it, expect } from 'vitest';
import { buildCsv } from '@/frontend/ui/linksnap/csv-export';
import type { AnalyticsExportRow } from '@/shared/contracts/linksnap';

const baseRow: AnalyticsExportRow = {
  clickedAt: '2026-08-01T10:00:00.000Z',
  referrer: 'https://example.com/post',
  ipCountry: 'SY',
  device: 'mobile',
  os: 'Android',
  browser: 'Chrome',
};

describe('buildCsv', () => {
  it('writes the header and one row per click', () => {
    expect(buildCsv([baseRow, { ...baseRow, referrer: null }])).toBe(
      [
        'Clicked At,Referrer,Country,Device,OS,Browser',
        '2026-08-01T10:00:00.000Z,https://example.com/post,SY,mobile,Android,Chrome',
        '2026-08-01T10:00:00.000Z,,SY,mobile,Android,Chrome',
      ].join('\n')
    );
  });

  it('quotes commas, quotes and newlines and keeps Arabic text intact', () => {
    const csv = buildCsv([
      { ...baseRow, referrer: 'شراء "قهوة", مساء' },
      { ...baseRow, referrer: 'سطر\nآخر' },
    ]);
    expect(csv).toContain('"شراء ""قهوة"", مساء"');
    expect(csv).toContain('"سطر\nآخر"');
  });

  it.each(['=HYPERLINK("https://evil.example","x")', '+1+1', '-1+1', '@SUM(A1)', '\tx', '\rx'])(
    'neutralises an attacker-controlled referrer that leads with a formula char: %j',
    (referrer) => {
      const csv = buildCsv([{ ...baseRow, referrer }]);
      const dataLine = csv.split('\n')[1] ?? '';
      expect(dataLine).toContain(`'${referrer.charAt(0)}`);
      expect(dataLine).not.toMatch(/(^|,)"?[=+\-@\t\r]/);
    }
  );

  it('neutralises a formula lead in every string column', () => {
    const csv = buildCsv([
      {
        ...baseRow,
        referrer: '=1',
        ipCountry: '+2',
        device: '-3',
        os: '@4',
        browser: '=5',
      },
    ]);
    expect(csv).toContain("'=1,'+2,'-3,'@4,'=5");
  });
});
