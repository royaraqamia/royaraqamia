import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { SCAN_COPY, SCAN_FORMAT_LABELS } from '@/frontend/ui/scan/scan-copy';
import { scanFormatLabel, scanKindLabel } from '@/frontend/ui/scan/scan-labels';

/**
 * #1789: the page's history and result card, and the app, must read the same
 * words from `shared/copy/scan.json`. The generated module is the seam; these
 * checks fail a source that holds a format without generating both names.
 */
const source = JSON.parse(
  readFileSync(join(process.cwd(), 'shared', 'copy', 'scan.json'), 'utf8')
) as {
  strings: Record<string, string>;
  formats: { entries: { detector: string; contract: string; label: string }[] };
};

describe('scan labels', () => {
  it('gives the history the same kind words as the result card', () => {
    for (const [key, expected] of Object.entries(source.strings)) {
      if (/^kind[A-Z]/.test(key)) {
        const kind = key.charAt(4).toLowerCase() + key.slice(5);
        expect(scanKindLabel(kind as Parameters<typeof scanKindLabel>[0])).toBe(expected);
      }
    }
    expect(scanKindLabel('link')).toBe(SCAN_COPY.kindLink);
  });

  it('resolves the detector name and the contract name to one label', () => {
    for (const { detector, contract, label } of source.formats.entries) {
      expect(SCAN_FORMAT_LABELS[detector]).toBe(label);
      expect(SCAN_FORMAT_LABELS[contract]).toBe(label);
      expect(scanFormatLabel(detector)).toBe(label);
      expect(scanFormatLabel(contract)).toBe(label);
    }
    expect(scanFormatLabel('a_format_we_do_not_know')).toBe('a_format_we_do_not_know');
  });
});
