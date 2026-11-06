import { describe, expect, it } from 'vitest';

import { allowanceOf, firstNumber, readStats } from '../usage.mjs';

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
});
