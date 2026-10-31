import type { AnalyticsExportRow } from '@/shared/contracts/linksnap';
import { escapeCsvText } from '@/shared/csv';

export function buildCsv(rows: AnalyticsExportRow[]): string {
  const header = ['Clicked At', 'Referrer', 'Country', 'Device', 'OS', 'Browser'];
  const lines = [header.join(',')];
  rows.forEach((row) => {
    lines.push(
      [
        escapeCsvText(row.clickedAt),
        // Anyone can choose the `Referer` header that the redirect records, so
        // this cell reaches a spreadsheet with an attacker's content in it.
        escapeCsvText(row.referrer),
        escapeCsvText(row.ipCountry),
        escapeCsvText(row.device),
        escapeCsvText(row.os),
        escapeCsvText(row.browser),
      ].join(',')
    );
  });
  return lines.join('\n');
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
