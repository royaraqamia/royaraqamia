import { describe, it, expect } from 'vitest';
import boardFixture from '@/shared/fixtures/parity/rates-board.json';
import type { RatesBoard, RateBasis } from '@/shared/contracts/rates';
import { convertAmount } from '@/shared/rates';
import { buildLookup, marketOptionsFor, oldestParallelAsOf } from '@/frontend/ui/rates/rate-lookup';
import { resolveDefaultPair, resolveDefaultTarget } from '@/frontend/ui/rates/rates-defaults';

/**
 * The conversion arithmetic, pinned on both sides (#658).
 *
 * The server sends a board, not a converted number, so the site and the app each
 * do the same arithmetic on the same rows. `RatesMath.kt` is that second copy, and
 * `shared/fixtures/parity/rates-board.json` is the shared answer: this suite proves
 * the fixture is what `shared/rates.ts` computes, and `RatesMathTest` proves the
 * Kotlin computes the same. A doubled or inverted rate on either client is a red
 * test rather than a figure a visitor has to notice (ADR-0098).
 *
 * Values are rounded to six decimals in the fixture and compared with a 1e-6
 * tolerance, so the two platforms' last-bit differences are not the test's subject:
 * the rate is.
 */
const board = boardFixture.board as unknown as RatesBoard;
const TOLERANCE = 1e-6;

function expectClose(actual: number | undefined | null, expected: number, label: string) {
  expect(actual, label).not.toBeNull();
  expect(actual, label).not.toBeUndefined();
  expect(Math.abs((actual as number) - expected), label).toBeLessThan(TOLERANCE);
}

describe('the rates board fixture', () => {
  it('pins a board with both metals and a two-market currency', () => {
    expect(board.base).toBe('USD');
    expect(board.metals.map((metal) => metal.code)).toEqual(['XAU', 'XAG']);
    expect(
      board.currencies.find((currency) => currency.code === 'YER')?.parallelMarkets?.length
    ).toBe(2);
  });

  it('agrees with shared/rates.ts on every conversion', () => {
    for (const testCase of boardFixture.conversions) {
      const lookup = buildLookup(board, testCase.market ?? null);
      const conversion = convertAmount(
        lookup,
        testCase.from,
        testCase.to,
        testCase.amount,
        (testCase.basis ?? 'official') as RateBasis,
        testCase.karat
      );

      if (testCase.expected === null) {
        expect(conversion, testCase.name).toBeNull();
        continue;
      }

      expect(conversion, testCase.name).not.toBeNull();
      expectClose(conversion?.result, testCase.expected.result, `${testCase.name} (result)`);
      expectClose(conversion?.rate, testCase.expected.rate, `${testCase.name} (rate)`);
    }
  });

  it('agrees on which markets a pair offers', () => {
    for (const testCase of boardFixture.markets) {
      expect(
        marketOptionsFor(board, testCase.codes).map((market) => market.key),
        testCase.codes.join('/')
      ).toEqual(testCase.expected);
    }
  });

  it('agrees on the oldest carried-forward market day', () => {
    for (const testCase of boardFixture.oldestParallelAsOf) {
      expect(oldestParallelAsOf(board, testCase.codes), testCase.codes.join('/')).toBe(
        testCase.expected
      );
    }
  });

  it('agrees on the pair a visitor starts with', () => {
    for (const testCase of boardFixture.defaults) {
      const label = testCase.detectedCountry ?? 'null';
      expect(resolveDefaultTarget(board, testCase.detectedCountry), label).toBe(testCase.to);
      expect(resolveDefaultPair(board, testCase.detectedCountry), label).toEqual({
        from: testCase.from,
        to: testCase.to,
      });
    }
  });
});
