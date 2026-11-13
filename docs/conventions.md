# Conventions & Style

## Formatting (Prettier)

```json
{
  "singleQuote": true,
  "semi": true,
  "printWidth": 100,
  "trailingComma": "es5",
  "tabWidth": 2,
  "endOfLine": "lf"
}
```

## Arabic text

Source and docs are **NFC** (`docs/adr/0063-source-text-is-nfc.md`).

Arabic writes a word's combining marks in two orders — fatha/damma/kasra then shadda, or shadda
then the vowel. They render identically and compare unequal, so an exact-text match (a Playwright
accessible name, a copy assertion) silently misses one of them.

- `unicode/no-non-nfc` fails the lint on any literal or JSX text that is not NFC.
- `npm run check:arabic` covers the rest (docs, JSON, scripts) and runs in CI; `npm run fix:arabic`
  rewrites.
- Write **جاري** (final ya), never **جارٍ** (tanween) — the copy decision in ADR 0054. Both forms are
  readable, but an exact-text match only hits one. The files that must name both spellings are
  allowlisted at the top of `scripts/check-arabic-order.mjs`.
- `public/quran/**` is vendored as published and is never normalised.

## Absolute URLs

Every absolute URL the server builds starts from `env.origin` (`backend/config/origin.ts`) — never
from the request (ADR-0178).

- `PUBLIC_ORIGIN` is the runtime value; `NEXT_PUBLIC_SITE_URL` is the build-time one the browser
  inlines, and `NEXT_PUBLIC_BASE_URL` is the old spelling. Development falls back to
  `http://localhost:3000`; production throws rather than guessing.
- `new URL(req.url).origin`, `.nextUrl.origin` and `Host` header reads are refused by
  `npm run check:origin`. A self-hosted Next server reports the address it listens on, so behind
  Render those answered `https://localhost:10000` — which is what `opencode mcp auth` and every
  completed Google sign-in were being sent to.

## Digits

Digits are always ASCII (`123`), never Arabic-Indic (`١٢٣`, U+0660–U+0669) or Persian
(`۱۲۳`, U+06F0–U+06F9) — in source, docs, UI copy, tests and stored content.

- `npm run check:digits` gates the repo (pre-commit + CI); `npm run fix:digits` rewrites.
- `toLatinDigits` (`shared/contracts/text.ts`) normalises runtime input and is used by the phone
  helpers; `toNullableText` applies it too.
- A digit-normalising database trigger covers writes to user-content tables, with a one-time
  backfill for rows written before it existed.
- Read-only numbers render in Aref Ruqaa (`--font-digits`, a `unicode-range`-limited face);
  editable controls fall back to the UI face. Never hard-code a font family on a number.
- The native Android update card does the same with `digitRunsOf`
  (`shell/DigitRuns.kt`); the percentage is written in ASCII before it reaches the string, so an
  Arabic-locale phone cannot produce Arabic-Indic digits.
- The allowlisted exceptions (normalisation fixtures, vendored `.agents/`/`public/quran/`, history
  files, the migration itself) are listed at the top of `scripts/check-digits.mjs`.

## Logging

- **Never** use `console.error/warn` outside loggers
- Use `backend/shared/logger` (server) or `frontend/shared/logger` (client)

## UI conventions

- RTL-first (Arabic primary)
- Design tokens are generated, not typed: `shared/tokens/tokens.json` is the
  source, `npm run tokens:generate` writes the site's `app/tokens.css`, the
  shell's `res/values/colors.xml` and the app's `DesignTokens.kt` and
  `ThemeColors.kt`, and `npm run check:tokens` fails a stale output or a
  stylesheet that re-declares a generated property by hand
- What those tokens resolve to in a browser is pinned too: `e2e/visual-baseline.spec.ts`
  compares every generated custom property, and the computed styles of one real
  surface, against `e2e/visual-baseline.json`; `npm run visual:baseline` re-records
  it after an intended change ([ADR-0096](adr/0096-the-visual-baseline-is-values-not-pixels.md))
- Radix + shadcn primitives
- No inline styles
- A shared component is a recipe, not a class list on one side and a Compose argument on
  the other: `shared/components/recipes.json` is the source, `npm run components:generate`
  writes `app/components.css` and the app's `Recipes.kt`, and `npm run check:components`
  fails a stale output or a name the tokens do not have
  ([ADR-0099](adr/0099-a-component-is-a-recipe.md))
- A port draws the site's own glyphs: `shared/icons/icons.json` lists them,
  `npm run vectors:generate` converts the lucide modules the site imports into Compose
  vectors, and `npm run check:vectors` fails a stale output. A ported component carries no
  `sm:`/`md:` utilities — it uses the fluid token steps both clients resolve
  ([ADR-0100](adr/0100-a-port-draws-the-sites-glyphs-and-scale.md))
- What the recipe says is what the browser paints: `e2e/plan-card-recipe.spec.ts` compares
  every value a ported component's recipe names with what Chromium computed, so the
  description and the rendering cannot part ways silently
- A ported component's words are generated, not retyped: `shared/copy/<surface>.json` is
  the source, `npm run copy:generate` writes the site's module and the app's Kotlin
  object, `npm run check:copy` fails a stale output and `npm run check:parity` fails a
  copy key the reference component does not render ([ADR-0098](adr/0098-a-ported-component-is-a-pair.md))
- Stylesheets are cut by surface, not by component: `app/global.css` is the
  shell every route loads, and each surface brings its own `app/<surface>/app.css`
  ([performance.md](performance.md#stylesheets-by-surface))
- A surface's stylesheet is appended after the shell's, so its utilities win the
  classes the two share; a **shell component must therefore never pair a base
  utility with a breakpoint variant** — write `max-sm:pt-5 sm:pt-6`, never
  `pt-5 sm:pt-6`, and `max-lg:block` + `lg:hidden`, never `hidden` +
  `max-lg:block`. A primitive whose property a caller must change takes a prop
  (`DialogContent phone="sheet"`), not an overriding className. `npm run check:layers`
  fails the shape ([ADR-0132](adr/0132-a-shell-component-owns-no-base-utility.md))

## Naming

- Test co-location marker: `*__tests__*` in filenames

## Git workflow

- **Branch/PR:** match repo style (CI gates merges on main/master)
- **Commit style:** conventional commits (`feat`, `fix`, `test`, `style`, …) — concise imperative
- **Micro-commits:** one atomic unit per commit; never commit red; never destructive (reset/force-push)
