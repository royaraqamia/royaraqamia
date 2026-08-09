import { describe, it, expect } from 'vitest';
import {
  buildCsv,
  parseCsv,
  stripCsvHeader,
  hasCsvHeaderLine,
  colorFromName,
  type SpendExportRow,
} from '@/backend/services/spendtrack/spendtrack-csv';

describe('buildCsv', () => {
  it('writes a header row and data rows', () => {
    const rows: SpendExportRow[] = [
      { date: '2026-08-01', amount: 50.5, category: 'طعام', description: 'غداء' },
      { date: '2026-08-02', amount: 20, category: 'مواصلات', description: null },
    ];
    expect(buildCsv(rows)).toBe(
      'date,amount,category,description\n2026-08-01,50.5,طعام,غداء\n2026-08-02,20,مواصلات,'
    );
  });

  it('escapes commas, quotes and newlines inside fields', () => {
    const rows: SpendExportRow[] = [
      { date: '2026-08-01', amount: 10, category: 'خدمات', description: 'فاتورة، "الإنترنت"' },
    ];
    const csv = buildCsv(rows);
    expect(csv).toContain('"فاتورة، ""الإنترنت"""');
  });
});

describe('parseCsv', () => {
  it('parses data rows (header included, stripped upstream)', () => {
    const content = 'date,amount,category,description\n2026-08-01,50.5,طعام,غداء';
    expect(parseCsv(content)).toEqual([
      { date: 'date', amount: NaN, category: 'category', description: 'description' },
      { date: '2026-08-01', amount: 50.5, category: 'طعام', description: 'غداء' },
    ]);
  });

  it('parses quoted fields containing commas and escaped quotes', () => {
    const content = '2026-08-01,10,خدمات,"فاتورة، ""الإنترنت"""';
    expect(parseCsv(content)).toEqual([
      { date: '2026-08-01', amount: 10, category: 'خدمات', description: 'فاتورة، "الإنترنت"' },
    ]);
  });

  it('tolerates CRLF line endings', () => {
    const content = '2026-08-01,5,طعام,قهوة\r\n2026-08-02,7,طعام,خبز';
    expect(parseCsv(content)).toHaveLength(2);
  });

  it('drops blank lines', () => {
    expect(parseCsv('2026-08-01,5,طعام,قهوة\n\n')).toHaveLength(1);
  });
});

describe('hasCsvHeaderLine / stripCsvHeader', () => {
  it('detects the exact header line', () => {
    expect(hasCsvHeaderLine('date,amount,category,description\n2026-08-01,5,طعام,x')).toBe(true);
    expect(hasCsvHeaderLine('2026-08-01,5,طعام,x')).toBe(false);
  });

  it('strips the header when present and leaves data intact', () => {
    const content = 'date,amount,category,description\n2026-08-01,5,طعام,قهوة';
    expect(stripCsvHeader(content)).toBe('2026-08-01,5,طعام,قهوة');
  });

  it('leaves headerless content unchanged', () => {
    const content = '2026-08-01,5,طعام,قهوة';
    expect(stripCsvHeader(content)).toBe(content);
  });
});

describe('colorFromName', () => {
  it('returns a stable hex color for a given name', () => {
    expect(colorFromName('طعام')).toMatch(/^#[0-9a-f]{6}$/);
    expect(colorFromName('طعام')).toBe(colorFromName('طعام'));
  });

  it('maps the same palette for similar categories', () => {
    expect(colorFromName('خدمات')).toBe(colorFromName('خدمات'));
  });
});
