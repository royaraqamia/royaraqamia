import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { deterministic, detectLanguage, dominantLanguage } from '../nour-evals/lib.mjs';

const gold = JSON.parse(readFileSync('scripts/nour-evals/gold-set.json', 'utf8'));
const suite = JSON.parse(readFileSync('scripts/nour-evals/suite.json', 'utf8'));
const mixed = gold.cases.find((entry) => entry.id === 'mixed-01');
const expectation = suite.model.find((entry) => entry.id === 'mixed-01').expect;

describe('dominant language gate', () => {
  it('keeps the neutral band in detectLanguage and adds a strict majority helper', () => {
    expect(dominantLanguage(mixed.userMessage)).toBe('en');
    expect(dominantLanguage(mixed.reply)).toBe('ar');
    expect(dominantLanguage('API endpoint GET POST')).toBe('en');
    expect(dominantLanguage('واجهة مسار')).toBe('ar');
    expect(dominantLanguage('API واجهة')).toBe('mixed');
    expect(detectLanguage(mixed.reply)).toBe('ar');
  });

  it('fails the stored wrong-language reply on the declared dominant language', () => {
    expect(expectation.expectDominantLanguage).toBe('en');
    expect(mixed.hardGate).toBe(true);

    const gate = deterministic(mixed.reply, expectation);
    expect(gate.pass).toBe(false);
    expect(gate.failures).toContain('dominant language: expected en, got ar');
  });

  it('passes a reply whose dominant language follows the code-switched member', () => {
    const reply =
      'An API is the whole contract: the rules, formats and auth. An endpoint is one URL inside it.';
    expect(deterministic(reply, expectation).pass).toBe(true);
  });
});
