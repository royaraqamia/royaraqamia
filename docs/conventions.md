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
