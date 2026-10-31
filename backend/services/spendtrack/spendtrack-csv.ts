import type { SpendImportRow } from '@/shared/contracts/spendtrack';
import { escapeCsvLiteral, escapeCsvText } from '@/shared/csv';

export const SPEND_CSV_HEADERS = ['date', 'amount', 'category', 'description'] as const;

export type SpendExportRow = {
  date: string;
  amount: number;
  category: string;
  description: string | null;
};

export function buildCsv(rows: SpendExportRow[]): string {
  const lines = [SPEND_CSV_HEADERS.join(',')];
  for (const row of rows) {
    lines.push(
      [
        // Date and amount stay format-controlled so the file still imports as
        // data; the user-authored fields get the formula-lead guard.
        escapeCsvLiteral(row.date),
        escapeCsvLiteral(row.amount),
        escapeCsvText(row.category),
        escapeCsvText(row.description),
      ].join(',')
    );
  }
  return lines.join('\n');
}

type CsvRecord = {
  cells: string[];
  /** Index just past the record's terminator, so the raw text can be sliced away. */
  end: number;
};

/**
 * One pass over the whole file, because a quoted cell may hold the line breaks
 * `buildCsv` writes into a multi-line description. A newline only ends a record
 * outside quotes; CRLF, CR and LF are all terminators, and inside a quoted cell
 * they collapse to `\n` so an imported description does not carry a stray `\r`.
 *
 * Only an unquoted cell is trimmed — spaces inside `"  padding  "` are the
 * user's.
 */
function parseCsvRecords(content: string): CsvRecord[] {
  const records: CsvRecord[] = [];
  let cells: string[] = [];
  let cell = '';
  let quoted = false;
  let cellQuoted = false;

  const endCell = () => {
    cells.push(cellQuoted ? cell : cell.trim());
    cell = '';
    cellQuoted = false;
  };

  const endRecord = (end: number) => {
    endCell();
    records.push({ cells, end });
    cells = [];
  };

  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    if (char === '"') {
      if (quoted && content[i + 1] === '"') {
        cell += '"';
        i++;
      } else {
        quoted = !quoted;
        if (quoted) cellQuoted = true;
      }
    } else if (char === '\r' || char === '\n') {
      const crlf = char === '\r' && content[i + 1] === '\n';
      if (quoted) {
        cell += '\n';
        if (crlf) i++;
      } else {
        if (crlf) i++;
        endRecord(i + 1);
      }
    } else if (char === ',' && !quoted) {
      endCell();
    } else {
      cell += char;
    }
  }

  if (cells.length > 0 || cell !== '' || cellQuoted) {
    endRecord(content.length);
  }

  return records;
}

export function parseCsv(content: string): SpendImportRow[] {
  return parseCsvRecords(content)
    .map((record) => record.cells)
    .filter((cells) => cells.some((cell) => cell.length > 0))
    .map((cells) => ({
      date: cells[0] ?? '',
      amount: Number.parseFloat(cells[1] ?? ''),
      category: cells[2] ?? '',
      description: cells[3] ?? '',
    }));
}

function isHeaderRecord(record: CsvRecord | undefined): boolean {
  if (!record) return false;
  return (
    record.cells.length === SPEND_CSV_HEADERS.length &&
    record.cells.every(
      (cell, index) => /^[a-zA-Z]+$/.test(cell) && cell.toLowerCase() === SPEND_CSV_HEADERS[index]!
    )
  );
}

export function hasCsvHeaderLine(content: string): boolean {
  return isHeaderRecord(parseCsvRecords(content)[0]);
}

/** Drops the first record — never a line inside a quoted cell — when it is the header. */
export function stripCsvHeader(content: string): string {
  const first = parseCsvRecords(content)[0];
  if (!first || !isHeaderRecord(first)) return content;
  return content.slice(first.end);
}

const DEFAULT_CATEGORY_COLORS = [
  '#0ea5e9',
  '#f43f5e',
  '#10b981',
  '#f59e0b',
  '#8b5cf6',
  '#14b8a6',
  '#ef4444',
  '#3b82f6',
  '#84cc16',
  '#ec4899',
];

export function colorFromName(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return (
    DEFAULT_CATEGORY_COLORS[hash % DEFAULT_CATEGORY_COLORS.length] ?? DEFAULT_CATEGORY_COLORS[0]!
  );
}
