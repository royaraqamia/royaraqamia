/**
 * Requires source text to be NFC, so the same Arabic word cannot be spelled two
 * ways in one codebase.
 *
 * Arabic writes a letter's combining marks in two orders. The Unicode canonical
 * order puts the vowel first — fatha (ccc 30), damma (31), kasra (32) — then
 * shadda (ccc 33), so the word `الرَّابط` is
 * `\u0627\u0644\u0631\u064E\u0651\u0627\u0628\u0637`. The reverse, shadda first
 * (`\u0631\u0651\u064E`), renders identically and is a different string:
 *
 *   const a = '\u0627\u0644\u0631\u064E\u0651\u0627\u0628\u0637';
 *   const b = '\u0627\u0644\u0631\u0651\u064E\u0627\u0628\u0637';
 *   a === b;                                   // false
 *   a.normalize('NFC') === b.normalize('NFC'); // true
 *
 * So every exact-text consumer — a Playwright `getByRole({ name })`, a
 * `getByText`, a copy assertion — matches one spelling and silently misses the
 * other (#337), and the two are indistinguishable in a review diff.
 *
 * NFC folds the reverse order into the canonical one. Measured over this repo,
 * NFC changes no file outside `public/quran/` except by reordering: it composes
 * nothing there, so the rewrite is byte-for-byte reversible in meaning and
 * cannot alter rendering. `public/quran/**` is vendored as published (ADR 0057,
 * ADR 0062) and is out of scope for the rule and the script.
 *
 * The rule checks the *source text* of a literal rather than its cooked value, so
 * it agrees exactly with `scripts/check-arabic-order.mjs`, which rewrites that
 * same text. A literal spelled with escapes is unambiguous and out of scope for
 * both — the drift this guard exists for is invisible text, and `'\u0651\u064E'`
 * is not invisible.
 *
 * See ADR 0063.
 */

/** True when `text` is already NFC — no mark order left to fold. */
export function isNfc(text) {
  return text === text.normalize('NFC');
}

/** The 1-based numbers of the lines in `text` that are not NFC. */
export function nonNfcLines(text) {
  const lines = [];
  text.split('\n').forEach((line, index) => {
    if (!isNfc(line)) lines.push(index + 1);
  });
  return lines;
}

const MESSAGE =
  'This text is not NFC: its Arabic combining marks are in a non-canonical order, so an ' +
  'exact-text match against the correctly spelled copy silently misses. Run ' +
  '`npm run fix:arabic`. See ADR 0063.';

const plugin = {
  rules: {
    'no-non-nfc': {
      meta: {
        type: 'problem',
        docs: {
          description: 'Require NFC so Arabic combining marks cannot drift out of order',
        },
        schema: [],
        messages: {},
      },
      create(context) {
        const check = (node) => {
          if (!isNfc(context.sourceCode.getText(node))) {
            context.report({ node, message: MESSAGE });
          }
        };
        return { Literal: check, TemplateElement: check, JSXText: check };
      },
    },
  },
};

export default plugin;
