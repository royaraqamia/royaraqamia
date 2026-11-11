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

/**
 * Hands the file to the platform's share sheet where it can, and downloads it
 * where it cannot (#964). The app always shares; the page shares when the Web
 * Share API accepts a file, so the action's label reads as sharing on both
 * clients and the same bytes leave the browser either way.
 */
export async function shareOrDownloadCsv(
  filename: string,
  content: string,
  title: string
): Promise<void> {
  const file = new File([`\uFEFF${content}`], filename, { type: 'text/csv;charset=utf-8;' });
  if (typeof navigator !== 'undefined' && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title });
      return;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
    }
  }
  downloadCsv(filename, content);
}
