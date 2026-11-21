import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { generate, OUTPUT } from '../generate-quran-fonts.mjs';
import {
  QURAN_MARKS_UNICODE_RANGE,
  QURAN_NON_MARKS_UNICODE_RANGE,
} from '../../shared/contracts/quran-marks.mjs';

const ROOT = path.resolve(import.meta.dirname, '..', '..');

/**
 * `next/font/local` only accepts literal option values, so the two reader
 * faces are generated from the shared mark-codepoint contract. This test is
 * what makes the generated literals a gate instead of a convention.
 */
describe('generate-quran-fonts', () => {
  it('reproduces the committed face module byte for byte', async () => {
    const current = await readFile(path.join(ROOT, OUTPUT), 'utf8');
    expect(current).toBe(`${generate()}\n`);
  });

  it('writes both declarations from the one contract', () => {
    const source = generate();
    expect(source).toContain(`value: '${QURAN_NON_MARKS_UNICODE_RANGE}'`);
    expect(source).toContain(`value: '${QURAN_MARKS_UNICODE_RANGE}'`);
    expect(source).toContain('preload: false');
  });
});
