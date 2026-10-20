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
  readable, but an exact-text match only hits one. The changelog and that ADR quote the old spelling on
  purpose, so `check:arabic` allowlists them.
- `public/quran/**` is vendored as published and is never normalised.

## Logging

- **Never** use `console.error/warn` outside loggers
- Use `backend/shared/logger` (server) or `frontend/shared/logger` (client)

## UI conventions

- RTL-first (Arabic primary)
- Design tokens / CSS custom properties
- Radix + shadcn primitives
- No inline styles

## Naming

- Test co-location marker: `*__tests__*` in filenames

## Git workflow

- **Branch/PR:** match repo style (CI gates merges on main/master)
- **Commit style:** conventional commits (`feat`, `fix`, `test`, `style`, …) — concise imperative
- **Micro-commits:** one atomic unit per commit; never commit red; never destructive (reset/force-push)
