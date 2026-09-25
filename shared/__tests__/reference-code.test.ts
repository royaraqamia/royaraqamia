import { describe, it, expect, vi } from 'vitest';
import {
  REFERENCE_CODE_ALPHABET,
  REFERENCE_CODE_LENGTH,
  mintReferenceCode,
  mintWithUniqueCode,
  type RandomIndex,
} from '@/shared/reference-code';

const at = (iso: string) => new Date(iso);
const zero: RandomIndex = () => 0;

describe('mintReferenceCode', () => {
  it('builds PREFIX-YYYY-XXXXXXXX from the injected random source', () => {
    expect(mintReferenceCode('TRN', zero, at('2026-09-25T00:00:00Z'))).toBe('TRN-2026-AAAAAAAA');
  });

  it('takes the year segment from the supplied instant', () => {
    expect(mintReferenceCode('PRJ', zero, at('2031-03-04T00:00:00Z'))).toBe('PRJ-2031-AAAAAAAA');
  });

  it('draws every character from the alphabet and fills the length it owns', () => {
    const last: RandomIndex = () => REFERENCE_CODE_ALPHABET.length - 1;
    const suffix = mintReferenceCode('RET', last, at('2026-01-01')).split('-')[2] ?? '';

    expect(suffix).toHaveLength(REFERENCE_CODE_LENGTH);
    expect(suffix).toBe('9'.repeat(REFERENCE_CODE_LENGTH));
  });

  it('omits characters that are easy to misread aloud', () => {
    for (const char of REFERENCE_CODE_ALPHABET) {
      expect('IO01').not.toContain(char);
    }
  });

  it('produces an uppercase code matching the product formats', () => {
    expect(mintReferenceCode('COMP', () => 5, at('2026-01-01'))).toMatch(
      /^COMP-\d{4}-[A-Z0-9]{8}$/
    );
  });
});

describe('mintWithUniqueCode', () => {
  const collision = new Error('taken');
  const isCollision = (error: unknown) => error === collision;
  const onExhausted = () => new Error('exhausted');

  it('returns the first code and its result without minting twice', async () => {
    const mint = vi.fn(() => 'CODE-1');
    const attempt = vi.fn(async () => 'stored');

    await expect(
      mintWithUniqueCode({ attempts: 3, mint, attempt, isCollision, onExhausted })
    ).resolves.toEqual({ code: 'CODE-1', result: 'stored' });
    expect(mint).toHaveBeenCalledTimes(1);
    expect(attempt).toHaveBeenCalledWith('CODE-1');
  });

  it('retries with a fresh code when the product reports a collision', async () => {
    const mint = vi.fn().mockReturnValueOnce('CODE-1').mockReturnValueOnce('CODE-2');
    const attempt = vi.fn().mockRejectedValueOnce(collision).mockResolvedValueOnce('stored');

    await expect(
      mintWithUniqueCode({ attempts: 3, mint, attempt, isCollision, onExhausted })
    ).resolves.toEqual({ code: 'CODE-2', result: 'stored' });
    expect(mint).toHaveBeenCalledTimes(2);
  });

  it('does not retry a failure the product does not call a collision', async () => {
    const boom = new Error('boom');
    const mint = vi.fn(() => 'CODE-1');
    const attempt = vi.fn().mockRejectedValue(boom);

    await expect(
      mintWithUniqueCode({ attempts: 3, mint, attempt, isCollision, onExhausted })
    ).rejects.toBe(boom);
    expect(mint).toHaveBeenCalledTimes(1);
  });

  it('spends the product budget, then raises the product error with the last collision', async () => {
    const mint = vi.fn(() => 'CODE-1');
    const attempt = vi.fn().mockRejectedValue(collision);
    const exhausted = vi.fn(() => new Error('exhausted'));

    await expect(
      mintWithUniqueCode({ attempts: 3, mint, attempt, isCollision, onExhausted: exhausted })
    ).rejects.toThrow('exhausted');
    expect(mint).toHaveBeenCalledTimes(3);
    expect(exhausted).toHaveBeenCalledWith(collision);
  });
});
