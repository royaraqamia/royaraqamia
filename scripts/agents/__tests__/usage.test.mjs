import { describe, expect, it } from 'vitest';

import { allowanceOf, firstNumber, isPeakPrice, readStats, softVerdict } from '../usage.mjs';

describe('agent usage', () => {
  describe('firstNumber', () => {
    it('reads a value from the top level', () => {
      expect(firstNumber({ cost: 0.25 }, ['cost'])).toBe(0.25);
    });

    it('reads a value from a totals container', () => {
      expect(firstNumber({ totals: { cost: 1.5 } }, ['cost'])).toBe(1.5);
    });

    it('finds a value nested under another shape', () => {
      expect(firstNumber({ sessions: [{ cost: 2 }] }, ['cost'])).toBe(2);
    });

    it('accepts a number printed as a string', () => {
      expect(firstNumber({ cost: '0.0041' }, ['cost'])).toBe(0.0041);
    });

    it('answers null when the key is absent', () => {
      expect(firstNumber({ totalTokens: 12 }, ['cost'])).toBeNull();
    });
  });

  describe('allowanceOf', () => {
    it('prefers the allowance the gateway counts over the balance charge', () => {
      expect(
        allowanceOf({
          usage: { cost: 0, opencode: { list_cost: 0.00412, allowance: 0.00412 } },
          cost: 0,
        })
      ).toBe(0.00412);
    });

    it('falls back to the list cost when there is no allowance field', () => {
      expect(allowanceOf({ list_cost: 0.12, cost: 0 })).toBe(0.12);
    });

    it('falls back to the charged cost when it is all the CLI reports', () => {
      expect(allowanceOf({ cost: 0.25 })).toBe(0.25);
    });

    it('answers null when nothing reports a dollar figure', () => {
      expect(allowanceOf({ requests: 12 })).toBeNull();
    });
  });

  describe('readStats', () => {
    it('answers null when the CLI is not installed', () => {
      expect(readStats(process.cwd(), 'definitely-not-an-opencode-binary')).toBeNull();
    });
  });

  describe('isPeakPrice', () => {
    const at = (iso) => new Date(iso);

    it('is peak inside 01:00-04:00 and 06:00-10:00 on a weekday', () => {
      expect(isPeakPrice(at('2026-11-06T02:00:00Z'))).toBe(true);
      expect(isPeakPrice(at('2026-11-06T08:00:00Z'))).toBe(true);
    });

    it('is off-peak at 10:00, at 05:00 and all weekend', () => {
      expect(isPeakPrice(at('2026-11-06T10:00:00Z'))).toBe(false);
      expect(isPeakPrice(at('2026-11-06T05:00:00Z'))).toBe(false);
      expect(isPeakPrice(at('2026-11-07T02:00:00Z'))).toBe(false);
    });
  });

  describe('softVerdict', () => {
    const caps = { capFive: 15, capWeek: 40, capMonth: 75 };

    it('stays open while every window is under its cap', () => {
      expect(softVerdict({ five: 1, week: 2, month: 3 }, caps)).toEqual({
        soft: false,
        reason: '',
      });
    });

    it('trims the month, not only the short windows', () => {
      // The month is the window whose exhaustion refuses a call outright; 2026-11-06
      // spent a day on `GoUsageLimitError` because the gate could not see it.
      const verdict = softVerdict({ five: 1, week: 2, month: 80 }, caps);
      expect(verdict.soft).toBe(true);
      expect(verdict.reason).toContain('monthly allowance');
    });

    it('names the window that answered, the shortest first', () => {
      const verdict = softVerdict({ five: 15, week: 50, month: 90 }, caps);
      expect(verdict.reason).toContain('five-hour allowance');
    });
  });
});
