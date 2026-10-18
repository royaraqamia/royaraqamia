# Source text is NFC, so Arabic cannot spell one word two ways

Arabic places a letter's combining marks in two orders across this codebase. The Unicode
canonical order sorts them by combining class — fatha 30, damma 31, kasra 32, shadda 33 — so the
vowel precedes the shadda and `الرَّابط` is `U+0627 U+0644 U+0631 U+064E U+0651 U+0627 U+0628
U+0637`. The reverse (`…U+0631 U+0651 U+064E…`) renders identically and is a different string:

```js
const a = '\u0627\u0644\u0631\u064E\u0651\u0627\u0628\u0637';
const b = '\u0627\u0644\u0631\u0651\u064E\u0627\u0628\u0637';
a === b; // false
a.normalize('NFC') === b.normalize('NFC'); // true
```

Two spellings of one word is invisible in a review diff and fatal to every exact-text consumer: a
Playwright `getByRole({ name })`, a `getByText`, a copy assertion. Measured before this decision,
across tracked source and docs: **1831** canonical occurrences in 318 files, **915** reverse ones
in 88 files, **56 files carrying both**. `frontend/ui/linksnap/link-row-card.tsx` spelled the delete
action one way in its dropdown item and the other way in the confirm dialog nine lines below it,
which is why `e2e/linksnap-offline.spec.ts` matched one and silently missed the other (#337).

We decided the repo's text is **NFC**, enforced on write, with the existing files folded once:

- `eslint-rules/no-non-nfc.mjs` (`unicode/no-non-nfc`) fails a literal or JSX text node whose source
  is not NFC, so a new spelling cannot land;
- `scripts/check-arabic-order.mjs` (`npm run check:arabic`, run in CI beside `check:env-docs`) covers
  what ESLint does not parse — docs, JSON, scripts — and `--fix` (`npm run fix:arabic`) is the
  formatting pass that repairs them.

Both read the _source text_, not the cooked value, so the guard and its fixer agree by construction.
A literal written with escapes is out of scope: it is unambiguous, and the drift being defended
against is invisible text.

`public/quran/**` is excluded. Measured across the repo, NFC changes no file outside that tree except
by reordering marks; inside it, NFC **composes** them, rewriting the text that ships. That corpus is
vendored as published (ADR 0057, ADR 0062) and is not ours to normalise.

## Considered Options

- **Normalise at comparison time** — a test helper that strips or normalises marks before matching.
  Rejected: it hides the trap instead of removing it, it helps only tests, and it makes every
  assertion depend on remembering the helper.
- **Select on stable hooks only** (ids, `data-*`), leaving copy alone. Rejected as the whole answer:
  it is right for tests and wrong for the copy itself — the same word still renders from two
  sources, and any future exact comparison meets the trap again.
- **Fold and guard.** Chosen.

## Consequences

- One commit rewrites 90 files. Every change is a reordering of combining marks — no file outside
  `public/quran/` changes length, so no word, layout or rendered glyph changes.
- The guard is a lint rule plus a CI step, so the invariant survives copy-paste, which is how the
  drift arrived in the first place.
- NFC also covers non-Arabic text (decomposed Latin accents, for instance). Nothing in the repo hits
  that today; it costs nothing to have the guard be general rather than word-specific, and a
  word-specific rule would be whack-a-mole against the next word with marks.
- Escaped spellings (`'\u0651\u064E'`) are not checked. They are unambiguous, but a test written
  that way still has to match the canonical order it asserts against.
