import type { AnalyticsExportRow } from '@/shared/contracts/linksnap';

export function buildCsv(rows: AnalyticsExportRow[]): string {
  const header = ['Clicked At', 'Referrer', 'Country', 'Device', 'OS', 'Browser'];
  const lines = [header.join(',')];
  rows.forEach((row) => {
    lines.push(
      [
        escapeCell(row.clickedAt),
        escapeCell(row.referrer),
        escapeCell(row.ipCountry),
        escapeCell(row.device),
        escapeCell(row.os),
        escapeCell(row.browser),
      ].join(',')
    );
  });
  return lines.join('\n');
}

function escapeCell(value: null | string): string {
  if (value === null) return '';
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function downloadCsv(filename: string, content: string): void {
  const blob = new Blob([`\uFEFF${content}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
