import type { SpendImportRow } from '@/shared/contracts/spendtrack';

export const SPEND_CSV_HEADERS = ['date', 'amount', 'category', 'description'] as const;

export type SpendExportRow = {
  date: string;
  amount: number;
  category: string;
  description: string | null;
};

function escapeCell(value: string | null | number): string {
  const text = value == null ? '' : String(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function buildCsv(rows: SpendExportRow[]): string {
  const lines = [SPEND_CSV_HEADERS.join(',')];
  for (const row of rows) {
    lines.push(
      [
        escapeCell(row.date),
        escapeCell(row.amount),
        escapeCell(row.category),
        escapeCell(row.description),
      ].join(',')
    );
  }
  return lines.join('\n');
}

function splitLines(content: string): string[] {
  return content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
}

function splitLine(line: string): string[] {
  const cells: string[] = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        quoted = !quoted;
      }
    } else if (char === ',' && !quoted) {
      cells.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells.map((cell) => cell.trim());
}

export function parseCsv(content: string): SpendImportRow[] {
  const cellsPerLine = splitLines(content).map(splitLine);
  return cellsPerLine
    .filter((cells) => cells.some((cell) => cell.length > 0))
    .map((cells) => ({
      date: cells[0] ?? '',
      amount: Number.parseFloat(cells[1] ?? ''),
      category: cells[2] ?? '',
      description: cells[3] ?? '',
    }));
}

export function hasCsvHeaderLine(content: string): boolean {
  const first = splitLines(content)[0];
  if (!first) return false;
  const cells = splitLine(first);
  return (
    cells.length === SPEND_CSV_HEADERS.length &&
    cells.every(
      (cell, index) => /^[a-zA-Z]+$/.test(cell) && cell.toLowerCase() === SPEND_CSV_HEADERS[index]!
    )
  );
}

export function stripCsvHeader(content: string): string {
  return hasCsvHeaderLine(content) ? splitLines(content).slice(1).join('\n') : content;
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
