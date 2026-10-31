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

  it.each(['=1+1', '+1', '-1', '@SUM(A1)', '\tx', '\rx'])(
    'neutralises a user-authored category or description that leads with %j',
    (lead) => {
      const csv = buildCsv([
        {
          date: '2026-08-01',
          amount: 10,
          category: `${lead}category`,
          description: `${lead}note`,
        },
      ]);
      const dataLine = csv.split('\n')[1] ?? '';
      expect(dataLine).toContain(`'${lead}category`);
      expect(dataLine).toContain(`'${lead}note`);
    }
  );

  it('leaves the date and amount columns format-controlled', () => {
    const csv = buildCsv([
      { date: '2026-08-01', amount: -12.5, category: 'طعام', description: null },
    ]);
    expect(csv.split('\n')[1]).toBe('2026-08-01,-12.5,طعام,');
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

  it('tolerates lone CR line endings', () => {
    const content = '2026-08-01,5,طعام,قهوة\r2026-08-02,7,طعام,خبز';
    expect(parseCsv(content)).toEqual([
      { date: '2026-08-01', amount: 5, category: 'طعام', description: 'قهوة' },
      { date: '2026-08-02', amount: 7, category: 'طعام', description: 'خبز' },
    ]);
  });

  it('keeps a quoted newline inside one cell instead of splitting the row', () => {
    const content = '2026-08-01,10,خدمات,"فاتورة الإنترنت\nالشهر الماضي"';
    expect(parseCsv(content)).toEqual([
      {
        date: '2026-08-01',
        amount: 10,
        category: 'خدمات',
        description: 'فاتورة الإنترنت\nالشهر الماضي',
      },
    ]);
  });

  it('reads a CRLF inside quotes as one line break, not a row break', () => {
    const content = '2026-08-01,10,خدمات,"line one\r\nline two"\r\n2026-08-02,7,طعام,خبز';
    expect(parseCsv(content)).toEqual([
      { date: '2026-08-01', amount: 10, category: 'خدمات', description: 'line one\nline two' },
      { date: '2026-08-02', amount: 7, category: 'طعام', description: 'خبز' },
    ]);
  });

  it('trims only unquoted cells', () => {
    const content = '  2026-08-01  ,  5  ,  طعام  ,"  قهوة  "';
    expect(parseCsv(content)).toEqual([
      { date: '2026-08-01', amount: 5, category: 'طعام', description: '  قهوة  ' },
    ]);
  });

  it('drops blank lines', () => {
    expect(parseCsv('2026-08-01,5,طعام,قهوة\n\n')).toHaveLength(1);
    expect(parseCsv('2026-08-01,5,طعام,قهوة\r\n\r\n2026-08-02,7,طعام,خبز\r\n')).toHaveLength(2);
  });

  it('parses a quoted description with a newline end to end', () => {
    const csv = buildCsv([
      { date: '2026-08-01', amount: 10, category: 'خدمات', description: 'line one\nline two' },
    ]);
    expect(parseCsv(stripCsvHeader(csv))).toEqual([
      { date: '2026-08-01', amount: 10, category: 'خدمات', description: 'line one\nline two' },
    ]);
  });

  it('round-trips a description holding a comma, a quote and a newline', () => {
    const rows: SpendExportRow[] = [
      { date: '2026-08-01', amount: 10, category: 'خدمات', description: 'line one\nline two' },
      {
        date: '2026-08-02',
        amount: 12.5,
        category: 'طعام',
        description: 'فاتورة، "الإنترنت"\nسطر ثانٍ',
      },
      { date: '2026-08-03', amount: 3, category: 'مواصلات', description: null },
    ];
    expect(parseCsv(stripCsvHeader(buildCsv(rows)))).toEqual([
      { date: '2026-08-01', amount: 10, category: 'خدمات', description: 'line one\nline two' },
      {
        date: '2026-08-02',
        amount: 12.5,
        category: 'طعام',
        description: 'فاتورة، "الإنترنت"\nسطر ثانٍ',
      },
      { date: '2026-08-03', amount: 3, category: 'مواصلات', description: '' },
    ]);
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

  it('strips the header without cutting into a quoted newline', () => {
    const content =
      'date,amount,category,description\r\n2026-08-01,10,خدمات,"line one\r\nline two"\r\n2026-08-02,7,طعام,خبز\r\n';
    expect(parseCsv(stripCsvHeader(content))).toEqual([
      { date: '2026-08-01', amount: 10, category: 'خدمات', description: 'line one\nline two' },
      { date: '2026-08-02', amount: 7, category: 'طعام', description: 'خبز' },
    ]);
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
