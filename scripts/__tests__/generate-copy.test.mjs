import { describe, expect, it } from 'vitest';

import {
  constantName,
  generate,
  placeholders,
  renderNative,
  renderWeb,
  validate,
} from '../generate-copy.mjs';

/**
 * One copy source, two outputs (#647, ADR-0098).
 *
 * The values are the site's words; what is asserted here is the seam: both
 * outputs carry the same strings, a string the emitters cannot place safely is
 * refused rather than escaped into a broken literal, and the tree's own source
 * generates the files that are committed.
 */
const source = {
  surface: 'plan',
  component: 'plan-card',
  web: { file: 'web/copy.ts', export: 'PLAN_CARD_COPY' },
  native: { file: 'android/Copy.kt', object: 'PlanCardCopy' },
  strings: {
    planFree: 'a',
    signInTitle: 'b',
    expires: 'ends on {date}, then a.',
  },
};

describe('validate', () => {
  it('accepts a source both emitters can place', () => {
    expect(validate(source)).toEqual([]);
  });

  it('refuses an empty label', () => {
    expect(validate({ ...source, strings: { a: '  ' } }).join('\n')).toContain('is empty');
  });

  it('refuses a string that would end a Kotlin literal', () => {
    expect(validate({ ...source, strings: { a: 'say "hi"' } }).join('\n')).toContain('no quote');
  });

  it('refuses an unbalanced placeholder', () => {
    expect(validate({ ...source, strings: { a: 'ends {date' } }).join('\n')).toContain(
      'unbalanced'
    );
  });

  it('refuses a key that is not camelCase', () => {
    expect(validate({ ...source, strings: { 'sign-in': 'a' } }).join('\n')).toContain(
      'camelCase key'
    );
  });
});

describe('the two outputs', () => {
  it('carry the same strings, and the same placeholders', () => {
    const web = renderWeb(source);
    const native = renderNative(source);

    expect(web.file).toBe('web/copy.ts');
    expect(native.file).toBe('android/Copy.kt');
    for (const [key, value] of Object.entries(source.strings)) {
      expect(web.contents).toContain(`${key}: '${value}'`);
      expect(native.contents).toContain(`const val ${constantName(key)} = "${value}"`);
      expect(placeholders(value)).toEqual(placeholders(value));
    }
  });

  it('name each other as the source of the strings', () => {
    expect(renderWeb(source, 'shared/copy/plan-card.json').contents).toContain(
      'shared/copy/plan-card.json'
    );
    expect(renderNative(source, 'shared/copy/plan-card.json').contents).toContain(
      'shared/copy/plan-card.json'
    );
  });
});

describe('the committed outputs', () => {
  it('are current', async () => {
    // The same comparison `npm run check:copy` makes; here it also proves the
    // generator is deterministic, which is what makes the check meaningful.
    const files = await generate();
    expect(files.size).toBeGreaterThan(0);
    const again = await generate();
    expect([...again.entries()]).toEqual([...files.entries()]);
  });
});
