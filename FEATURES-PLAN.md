# UI/UX Feature Plan — BlogPress · LinkSnap · HabitFlow · SpendTrack

> Authoritative roadmap for the 4 SaaS products inside **رؤية رقمية (royaraqamia)**.
> This file exists so we never lose context between sessions: read it, work a phase, tick it off.

## Status legend

| Mark       | Meaning                                                    |
| ---------- | ---------------------------------------------------------- |
| ✅ DONE    | Already shipped (verified in repo, v1)                     |
| 🔶 PARTIAL | Exists in a basic form; listed items are the gaps to close |
| ⬜ TODO    | Not built yet — planned work                               |

## Conventions to obey while implementing (from `AGENTS.md` / `README.md`)

- **Layering (never break):** `controller → service → repository/client`. Controllers are thin; repositories are the **only** code touching the DB; Supabase `.from()` stays in `backend/repositories` / `frontend/transport`.
- **Feature folders:** code goes in `app/<product>/`, `frontend/ui/<product>/`, `backend/services/<product>/`, `backend/repositories/<product>/`.
- **Shared contracts:** all request/response shapes live in `shared/contracts` (Zod + TS), never duplicated.
- **Migrations:** incremental **new** timestamped files in `supabase/migrations/`. Never edit an applied migration. Apply via `supabase db push`.
- **RLS / security:** RLS on every new table; admin-only writes via `ADMIN_EMAILS` allowlist; service-role key is server-only. Rate-limit anything user-facing.
- **UI:** RTL-first, Arabic primary, design tokens / CSS custom properties, Radix + shadcn primitives, Phosphor/Lucide icons, Sonner toasts, Motion. No inline styles.
- **Quality gates per change:** `npx prettier --check .`, `npm run lint`, `npx tsc --noEmit`, `npm test`, `npm run build`, E2E when the flow is covered.
- **Git:** one atomic unit per commit, conventional commits, never commit red.

---

## 1. BlogPress — مدير المقالات

### Current state (v1)

| Feature                                                                                                       | Status |
| ------------------------------------------------------------------------------------------------------------- | ------ |
| Dashboard with stat cards (total / published / scheduled / views)                                             | ✅     |
| Post list with category filter                                                                                | ✅     |
| Create post button + categories CRUD (flat)                                                                   | ✅     |
| TipTap WYSIWYG editor (`app/blogpress/editor/[id]`) + toolbar                                                 | ✅     |
| Drafts / published / scheduled workflows (`status`, `publish_at`)                                             | ✅     |
| SEO checklist + SERP metadata (`meta_title`, `meta_desc`)                                                     | ✅     |
| Cover images + Storage bucket + media service                                                                 | ✅     |
| Views tracking (`view_count`), featured flag, blog visibility                                                 | ✅     |
| Post settings dialog                                                                                          | ✅     |
| **Split-pane live editor + in-editor SEO & stats side panel**                                                 | ✅     |
| **Auto-save drafts (debounced) + saving indicator**                                                           | ✅     |
| **Content stats in toolbar + side panel (words, reading time, headings, readability, alt-text)**              | ✅     |
| **Tags + many-to-many (`post_tags` join)** — create/toggle in editor, chips on dashboard cards + article page | ✅     |

### Backlog

| Priority | Feature                                                                               | UX rationale                                                                                                                 | Files / layers                                                                                                                                                                                                            |
| -------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0       | **Split-pane live editor + in-editor SEO panel**                                      | Writers want instant feedback; replace the separate SEO page with a side panel (char counters, SERP preview, readiness, alt) | ✅ Done — SEO + stats + tags tabs in `frontend/ui/blogpress/editor-side-panel.tsx`, opened from `editor-content.tsx`                                                                                                      |
| P0       | **Auto-save drafts (debounced) + “آخر حفظ” indicator**                                | Zero data-loss anxiety; the #1 editor expectation                                                                            | ✅ Done — `frontend/state/blogpress/use-post-autosave.ts` (1.2s debounce, sails to existing `PATCH /api/blogpress/posts/[id]`), indicator in `editor-content.tsx`                                                         |
| P0       | **Content stats in toolbar** — reading time, word/heading/paragraph count             | Instant calibration while writing                                                                                            | ✅ Done — `frontend/shared/blogpress/content-stats.ts` + stats in `editor-toolbar.tsx` + side panel                                                                                                                       |
| P1       | **Bulk actions on post list** — multi-select → publish / schedule / delete / category | Table power-users                                                                                                            | ✅ Done — checkbox rows + bulk bar in `post-list.tsx`, `app/blogpress/api/posts/bulk/route.ts`, bulk fns in `frontend/api/blogpress.ts`                                                                                   |
| P1       | **Calendar/board view for scheduled posts** — drag to reschedule                      | Visual publishing pipeline                                                                                                   | ✅ Done — `frontend/ui/blogpress/calendar-board.tsx` at `app/blogpress/app/calendar`, drag-to-reschedule via `PATCH /api/blogpress/posts/[id]`                                                                            |
| P2       | **First-run onboarding + empty states** — sample post, guided tour                    | Reduce first-write friction                                                                                                  | 🔶 PARTIAL — empty state exists (`post-list.tsx`: لا توجد مقالات بعد + مقال جديد CTA); no guided tour / sample post                                                                                                       |
| P2       | **Export post (Markdown/HTML) + duplicate post**                                      | Content portability                                                                                                          | ✅ Done — `duplicatePost` service + `POST /api/blogpress/posts/[id]/duplicate`, `downloadPostAsFile` (`frontend/shared/blogpress/export-post.ts`), actions in `post-actions-menu.tsx` (editor) + `post-list.tsx` row menu |
| P2       | **Reading-progress / focus mode**                                                     | Calm writing environment                                                                                                     | ✅ Done — focus mode in `editor-content.tsx` (وضع التركيز) + `EditorReadingProgress` bar tracking the ProseMirror container (`editor-reading-progress.tsx`)                                                               |

### DB impact

- ✅ `20260807170000_blog_tags.sql` — `blog_tags` + `post_tags` join (RLS, grants) — applied to remote.

---

## 2. LinkSnap — اختصار الروابط

### Current state (v1)

| Feature                                                              | Status |
| -------------------------------------------------------------------- | ------ |
| Shorten single + bulk (`/api/shorten`, `/api/shorten/bulk`)          | ✅     |
| Links dashboard (rows, view-selector, skeleton loaders, empty state) | ✅     |
| Edit / delete links, custom back-half (`update-link.ts`)             | ✅     |
| Click analytics: total, daily series, top referrers, recent events   | ✅     |
| Analytics drawer + chart                                             | ✅     |
| QR code modal                                                        | ✅     |
| Admin panel: stats cards, links directory, moderate/block            | ✅     |
| Redirect handler `app/[code]`, security validator, rate limiting     | ✅     |
| **Link expiry + status chips** (active / expired / blocked)          | ✅     |
| **Device/OS/browser breakdown** (dependency-free UA parser)          | ✅     |
| **Analytics date-range filter + CSV export** (7/30/90d, client-side) | ✅     |
| **Bulk action bar** — select-all, copy URLs, set expiry, delete      | ✅     |

### Backlog

| Priority | Feature                                                               | UX rationale                                     | Files / layers                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| -------- | --------------------------------------------------------------------- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1       | **Share sheet + copy feedback** (toast) per row                       | Immediate gratification, mobile-friendly sharing | ✅ Done — per-row copy + Sonner toast (`link-row-card.tsx` handleCopy) + `Share2` per-row button (`handleShare`, Web Share API with copy fallback)                                                                                                                                                                                                                                                                                                          |
| P2       | **Password-protected links** (per-link secret, RLS-safe)              | Private/campaign links                           | ✅ Done — migration `20260818120000_links_password.sql` (`password_hash`, applied via MCP); scrypt hashing `backend/shared/password-hash.ts`; protected links skip redirect + go to `/unlock/[code]` page (`redirect-url.ts` kind `password-protected`, `unlock` reserved); `POST /linksnap/api/unlock` (rate-limited, `unlock-link.ts` records the real click + owner notify); password field in shorten form + edit dialog (set/clear, keeps hash secret) |
| P2       | **Custom slugs validation UX** — live availability check while typing | Error prevention before submit                   | ✅ Done — `GET /linksnap/api/availability` (`check-code-availability.ts`, rate-limited), debounced `use-slug-availability.ts` in shorten form + slug field with live check in `link-edit-dialog.tsx`, re-slugging via `PATCH /api/links` (`newCode`), FK cascade migration `20260818100000_short_links_code_update_cascade.sql`                                                                                                                             |

### DB impact

- ✅ New migration: `links.expires_at` (applied via MCP, `20260807220000_links_expiry.sql`) and `links.password_hash` (applied via MCP, `20260818120000_links_password.sql`). No further indexes pending for these. Protected links skip bot-flagging — the unlock step records the click.

---

## 3. HabitFlow — تعقب العادات

### Current state (v1)

| Feature                                                                 | Status |
| ----------------------------------------------------------------------- | ------ |
| Daily/weekly habit tracking + toggle logs                               | ✅     |
| Streak calendar (weekly/monthly), completion stats, aggregate stats     | ✅     |
| Local-first mode + cloud sync (`mode`, `user`)                          | ✅     |
| Backup / restore service                                                | ✅     |
| Archive habits                                                          | ✅     |
| Daily reminders via `pg_cron` → in-app notifications (`habit_reminder`) | ✅     |

### Backlog

| Priority | Feature                                                                                               | UX rationale                                     | Files / layers                                                                                                                                                                                                                                                                                                 |
| -------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0       | **Onboarding / guided first-habit creation** with icon picker + template gallery                      | The biggest drop-off point in habit apps         | ✅ `habit-onboarding.tsx` + `HABIT_TEMPLATES` (8 templates that pre-fill the add modal); replaces the empty state when no habits; `habit-templates.test.ts`                                                                                                                                                    |
| P0       | **Skip vs Miss** (streak-freeze/skip days)                                                            | Streaks shouldn’t break on rest days → retention | ✅ Migration (`20260807160000_habit_log_kinds.sql`, `log_kind` + unique index), contract `HabitLogKind`, all 3 repos + `setLogKind`, `habit-service.setHabitLogKind`, `POST /habitflow/api/logs/kind`, skip-aware streak math in `habit-stats.ts` (skip freezes, miss breaks), skip toggle in `habit-card.tsx` |
| P0       | **Notes/journal per log** — “لماذا/كيف شعرت”                                                          | Emotional anchoring strengthens habit formation  | ✅ Migration (`20260807163000_habit_log_notes.sql`, `note`), repos + `setLogNote`, `setHabitLogNote`, `POST /habitflow/api/logs/note`, `notes-dialog.tsx`                                                                                                                                                      |
| P1       | **Weekly/monthly targets per habit** (goal), not just daily/weekly frequency                          | Measures progress, not just completion           | ✅ Done — migration `20260809120000_habit_targets_and_reminder_time.sql` (`target`, `target_period` + CHECKs), `calculateTargetProgress` in `habit-stats.ts`, target chip in `habit-card.tsx`, fields in add/edit modals                                                                                       |
| P1       | **Insights** — best day-of-week, best hour, recovery rate, longest-streak milestones with celebration | Motivational analytics the engine supports       | ✅ `habit-insights.ts` (`calculateInsights` + `isCelebrationStreak`), `insights-row.tsx`, `habit-insights.test.ts`                                                                                                                                                                                             |
| P1       | **Custom reminder time per habit** (surface existing notification infrastructure)                     | Reminders that fit daily rhythm                  | ✅ Done — `habits.reminder_time` (UTC, null→07:00), cron reworked to `*/15 * * * *` honouring per-habit window, time input in add/edit modals                                                                                                                                                                  |
| P2       | **Export (CSV/JSON)** alongside existing backup                                                       | Data ownership                                   | 🔶 PARTIAL — JSON backup/restore exists (`backup-service.ts`, `habitflow_backup_*.json`); no CSV / format-picker                                                                                                                                                                                               |
| P2       | **Streak-frozen badge + gentle recovery nudge** notification                                          | Prevent churn after a miss                       | ⬜ TODO — no frozen badge in `calendar-grid.tsx`; no `recovery_nudge` notification type/cron                                                                                                                                                                                                                   |

### DB impact

- ✅ `habit_logs.log_kind` (`20260807160000_habit_log_kinds.sql`) — applied to remote `ievboaylytxgtijconak`.
- ✅ `habit_logs.note` (`20260807163000_habit_log_notes.sql`) — applied to remote `ievboaylytxgtijconak`.
- ✅ `habits.target`, `habits.target_period`, `habits.reminder_time` + cron re-schedule (`20260809120000_habit_targets_and_reminder_time.sql`).

---

## 4. SpendTrack — تتبع المصروفات

### Current state (v1)

| Feature                                                                        | Status |
| ------------------------------------------------------------------------------ | ------ |
| Total spend card (date-range aware, Hijri display)                             | ✅     |
| Monthly budget card (`budgets` table, one row per user/month) + exceeded alert | ✅     |
| Category pie chart, daily bar chart                                            | ✅     |
| Transactions list: filters (category), sort, pagination                        | ✅     |
| Categories CRUD                                                                | ✅     |
| Expense dialog (create), `expense_alert` notification wiring                   | ✅     |

### Backlog

| Priority | Feature                                                                            | UX rationale                                                        | Files / layers                                                                                                                               |
| -------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| P0       | **Per-category budgets** — generalize `budgets` to `(user_id, month, category_id)` | The single most requested money-control feature; alert per category | ✅ Migration (`category_id` + partial unique indexes), repo, service, `category-budgets.tsx`, per-category alert                             |
| P0       | **Recurring expenses** — define monthly bills, auto-insert/flag                    | Bills dominate spending; removes manual entry                       | ✅ Migration (`recurring_expenses` + pg_cron materializer), CRUD API, `recurring-expenses.tsx`                                               |
| P0       | **Search transactions** (description/notes)                                        | Find the $20 “where did it go”                                      | ✅ `search` in query + repo ilike + debounced filter                                                                                         |
| P1       | **Insights strip** — top category, avg/day, month-over-month delta                 | Answer “am I spending more?” in one glance                          | ✅ Done — `spend-insights.ts` (+`previousPeriodRange`/`calculateInsights`), `SpendtrackService.getInsights`, `InsightsStrip` on dashboard    |
| P1       | **CSV import/export**                                                              | Onboarding + backup + portability                                   | ✅ Done — `spendtrack-csv.ts` (build/parse), `getExportCsv`/`importExpensesCsv`, `/api/export` + `/api/import`, `CsvActions` on dashboard    |
| P1       | **Undo toast on delete**                                                           | Safety net for destructive actions                                  | ✅ Done — `useDeleteExpense` accepts the full expense and offers a «تراجع» action that re-creates it (`use-expenses.ts`, `expense-list.tsx`) |
| P2       | **Split expense across categories**                                                | Real-world purchase reality                                         | ⬜ TODO — `expense-dialog.tsx` has single `category_id`; no `expense_splits` migration                                                       |
| P2       | **Multi-currency** (base currency + per-expense currency)                          | Regional users                                                      | 🔶 PARTIAL — per-USER currency shipped (`user_settings` 20260807150000, `currency-selector.tsx`); no per-EXPENSE `expenses.currency`         |

### DB impact (date-checked)

- ✅ `budgets.category_id` + partial unique indexes (`20260807120000_per_category_budgets.sql`), `recurring_expenses` + pg_cron materializer (`20260807123000_recurring_expenses.sql`), `user_settings.currency` (`20260807150000_create_user_settings.sql`) — all applied to remote.
- ⬜ `expenses.currency`, `expense_splits` still anticipated for P2.

---

## 5. Cross-cutting (all 4 products) — do last, once per product

| Priority | Feature                                                                                    | Status / notes                                                                                                                                                              |
| -------- | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1       | **`Cmd/Ctrl+K` command palette** (new habit / new expense / shorten link / new post)       | 🔶 PARTIAL — global palette exists (`frontend/ui/app-shell/command-palette.tsx`, Cmd+K wired in app-shell) navigates to apps/blog only; no per-product quick-create actions |
| P1       | **Optimistic UI + rollback** on toggles/create (HabitFlow check, SpendTrack quick-add)     | ⬜ TODO — no `useOptimistic`/optimistic mutations anywhere                                                                                                                  |
| P1       | **Undo/Redo toasts** (Sonner) on all destructive actions                                   | 🔶 PARTIAL — delete confirms + success toasts in some products; no `undo` action buttons                                                                                    |
| P2       | **Keyboard-first**: `/` slash commands, save/check shortcuts                               | ⬜ TODO — only a11y focus rings; no slash/shortcut layer                                                                                                                    |
| P2       | **Consistent onboarding + empty states** across all 4                                      | 🔶 PARTIAL — HabitFlow onboarded; BlogPress empty state exists; LinkSnap/SpendTrack partial                                                                                 |
| P2       | **A11y pass**: focus rings, contrast, `aria-live` on toggled/chart mockups, reduced-motion | ⬜ TODO — not done                                                                                                                                                          |

---

## 6. Rollout order (phases → micro-commits → tests)

Recommended sequence. Each phase ships green (`prettier`, `lint`, `tsc`, `vitest`, `build`; E2E where covered).

- **Phase 1 — SpendTrack core** ✅ _(search, per-category budgets, recurring — all shipped)_: per-category budgets → recurring expenses → search. _Highest user value, clean extension of existing `budgets`._
- **Phase 2 — HabitFlow core** ✅ complete: onboarding + empty state → skip/miss (streak-freeze) → per-habit notes → insights. _Progress: skip/miss ✅ `aec2b09`, notes ✅ `e850a48`, onboarding ✅ `952f0a0`, insights ✅ `1a000b6`._
- **Phase 3 — BlogPress core** ✅ complete: auto-save + saving indicator → in-editor SEO panel + content stats → tags.
- **Phase 4 — LinkSnap core** ✅ shipped: expiry + status chips → device/OS/browser analytics → date-range + CSV export → bulk actions.
- **Phase 7 — Remaining P1 (current work)**: BlogPress bulk actions ✅ + scheduled calendar/board ✅ → SpendTrack insights strip ✅ + CSV ✅ + undo ✅ → HabitFlow targets ✅ + custom reminder time ✅ → LinkSnap share sheet per row ✅ + slug availability ✅. **Phase 7 complete.**
- **Phase 5 — Cross-cutting polish**: palette quick-actions, optimistic UI, undo toasts, onboarding consistency, a11y.
- **Phase 6 — P2 backlog** per product (post export/duplicate, expense splits, per-expense currency, HabitFlow CSV/nudge, focus+reading-progress, password-protected links).

### Per-feature implementation checklist (reuse for every item)

1. New migration file (if schema change) + RLS/grants. Push to branch DB.
2. Update `shared/contracts/<product>.ts` (Zod + types).
3. Repository change (DB access only here).
4. Service logic + unit tests (`backend/services/<product>/__tests__`).
5. API route / loader (`app/<product>/api/...`, `backend/loaders/<product>.ts`).
6. UI component(s) (`frontend/ui/<product>/`), RTL Arabic.
7. Run gates + commit atomically.

---

## 7. Definition of done (per phase)

- All listed P0/P1 features for the phase implemented and demo-able.
- `npx prettier --check .`, `npm run lint`, `npx tsc --noEmit`, `npm test`, `npm run build` all green.
- E2E (Playwright) green where flows are covered; new responsive coverage added for changed screens.
- No secrets leaked; RLS/access control preserved; DB changes shipped as **new** migrations only.
- Unit tests cover new service logic (streak-freeze math, budget aggregation, UA parsing, auto-save merge).

---

## 8. Open questions / risks

- **Budget unique constraint change** (`user_id, month` → `user_id, month, category_id` nullable) needs a careful backfill migration — confirm existing single-row budgets migrate cleanly.
- **Recurring expenses** need a scheduler (extend the `pg_cron` pattern used by habit reminders) — confirm acceptable infra.
- **LinkSnap password links** interact with the redirect bot/security validator — decide whether protected links skip bot-flagging.
- **HabitFlow local-first + cloud sync** must reconcile new fields (`skip`, `note`, `target`) in the backup/restore format — keep versioned.
- Multi-currency affects every SpendTrack total/alert — recommended last.
