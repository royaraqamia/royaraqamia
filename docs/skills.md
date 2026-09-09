# Available Skills

Use proactively when task matches. Load with the `skill` tool.

## Core Engineering (mattpocock/skills)

- `implement` — Execute approved blueprint
- `implement-spec` — Implement a specification in code
- `opencode-delegate` — Delegate coding tasks to OpenCode CLI for background implementation
- `code-review` — Review branch/PR against standards + spec
- `codebase-design` — Deep module design, seams, testability
- `improve-codebase-architecture` — Scan for deepening opportunities
- `tdd` — Test-driven development
- `diagnosing-bugs` — Hard bugs/performance regression loop
- `domain-modeling` — CONTEXT.md, ADRs, terminology
- `grilling` / `grill-me` / `grill-with-docs` — Stress-test plans
- `to-spec` / `to-tickets` / `triage` / `wayfinder` — Spec → tickets → tracker
- `prototype` — Throwaway prototypes for design questions
- `research` — Delegate reading legwork to background agent
- `wizard` — Interactive bash wizards for human-only steps
- `handoff` / `claude-handoff` — Compact context for next agent
- `retro` — Session retrospective
- `ask-matt` — Router: which skill/flow fits your situation
- `code-refactorer` — Restructure working code to clean layered architecture (SOLID)
- `setup-matt-pocock-skills` — Configure repo for engineering skills

## Vercel & Deployment (vercel-labs/agent-skills)

- `deploy-to-vercel` — Deploy to Vercel (preview/production)
- `vercel-cli-with-tokens` — Token-based Vercel CLI auth
- `vercel-optimize` — Cost/performance optimization
- `vercel-react-best-practices` — React/Next.js perf patterns
- `vercel-composition-patterns` — Compound components, context, render props
- `vercel-react-view-transitions` — View Transition API animations
- `vercel-react-native-skills` — React Native/Expo best practices
- `web-design-guidelines` — UI audit: accessibility, UX, best practices
- `writing-guidelines` — Docs/prose review

## Supabase (supabase/agent-skills)

- `supabase` — Database, Auth, Edge Functions, Realtime, Storage, Vectors, Cron, Queues, migrations, SSR
- `supabase-postgres-best-practices` — Schema, RLS, indexes, migrations, pgvector, pg_cron, performance

## UI/Design (ui-ux-pro-max)

- `ui-ux-pro-max` — 84 styles, 192 palettes, 74 font pairings, UX guidelines
- `ui-styling` — shadcn/ui + Radix + Tailwind, accessible components
- `design-system` — Token architecture (primitive→semantic→component)
- `frontend-design` — Distinctive visual design, typography, aesthetic direction
- `design` — Brand identity, logo, CIP, mockups, slides, banners, icons
- `slides` — Strategic HTML presentations with Chart.js
- `banner-design` — Social/ads/web/print banners (22 styles)
- `brand` — Voice, visual identity, messaging, compliance

## Productivity & Writing

- `writing-beats` / `writing-fragments` / `writing-shape` / `writing-for-agents` — Structured writing
- `teach` — Teach concepts in workspace
- `setup-pre-commit` — Husky + lint-staged + typecheck + tests
- `setup-ts-deep-modules` — dependency-cruiser for deep modules
- `migrate-to-shoehorn` — Replace `as` assertions in tests
- `git-guardrails-claude-code` — Block destructive git commands
- `scaffold-exercises` — Exercise directory structures
- `resolving-merge-conflicts` — Merge/rebase conflict resolution
- `wait-what` — Re-pitch unclear messages
- `loop-me` — Grill on workflow specs
- `to-questionnaire` — Delegate decisions

## Skill Versioning

- All installed GitHub-sourced skills locked in `skills-lock.json` with content hashes
- Never edit hashes manually — they're computed from skill content
- Re-run skill installer when upstream releases new versions
