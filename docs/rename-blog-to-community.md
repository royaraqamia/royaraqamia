# Rename `blog` → `community`

Plan for renaming the public blog surface and its supporting identifiers to
**community**. BlogPress (the authoring CMS) keeps its name. The DB and the
public URL are renamed for real — no `/blog` redirect is kept.

Status: **proposed** — do not execute until approved.

## Decisions

| Question    | Decision                                                                          |
| ----------- | --------------------------------------------------------------------------------- |
| Target term | `community`                                                                       |
| BlogPress   | Keep `blogpress` names, routes and product brand as-is                            |
| Database    | Full rename via migration (tables, columns, policies, indexes, functions, bucket) |
| Public URL  | Hard switch `/blog` → `/community`; no redirect                                   |
| Execution   | Plan first, then staged changes with verification gates                           |

## Non-goals

- Renaming MCP OAuth scopes `blog.read` / `blog.write` (external, already-issued tokens). See Stage 6.
- Renaming the `blogpress` product, its routes (`/blogpress/*`), its identifiers, or its landing.
- Renaming the `post` domain noun. `Post`/`posts`/`PostSummary` stay; only the `blog` qualifier changes
  (`blog_categories` → `community_categories`, `blog_visible` → `community_visible`).

## Critical constraint: the base schema is a stub

`supabase/migrations/20260718105449_unified_schema_all_projects.sql` is a 4-line
stub. `posts`, the `post_status` enum, and the `update_posts_updated_at`
trigger/function exist **only in the live remote database**. Any rename of those
objects cannot be reproduced from the repo. The DB stage must:

1. Dump the live schema (or read it via MCP) to confirm exact object names.
2. Generate one migration that renames everything in a transaction.
3. Verify RLS policies, indexes, the partial feed index, and the RPC all follow the rename.

## Naming map

| Before                                                                                                                            | After                                                                                                                                                      |
| --------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/blog`, `/blog/[slug]`                                                                                                           | `/community`, `/community/[slug]`                                                                                                                          |
| `/api/blog/index`                                                                                                                 | `/api/community/index`                                                                                                                                     |
| `/api/blog/[slug]/view`                                                                                                           | `/api/community/[slug]/view`                                                                                                                               |
| `app/blog/**`, `app/api/blog/**`                                                                                                  | `app/community/**`, `app/api/community/**`                                                                                                                 |
| `backend/loaders/blog.ts`                                                                                                         | `backend/loaders/community.ts`                                                                                                                             |
| `backend/controllers/blog.ts`                                                                                                     | `backend/controllers/community.ts`                                                                                                                         |
| `backend/config/blog.ts`                                                                                                          | `backend/config/community.ts`                                                                                                                              |
| `backend/shared/blog-cache-tags.ts`                                                                                               | `backend/shared/community-cache-tags.ts`                                                                                                                   |
| `shared/contracts/blog.ts`                                                                                                        | `shared/contracts/community.ts`                                                                                                                            |
| `BLOG_TAGS`, `BLOG_MUTATION_TAGS`                                                                                                 | `COMMUNITY_TAGS`, `COMMUNITY_MUTATION_TAGS`                                                                                                                |
| `loadBlogIndex`, `loadBlogPost`                                                                                                   | `loadCommunityIndex`, `loadCommunityPost`                                                                                                                  |
| `Blog*` components (`BlogPage`, `BlogResults`, …)                                                                                 | `Community*`                                                                                                                                               |
| `BlogViewRecorder`, `BlogPostViewRateLimitError`, `recordBlogPostView`, `createBlogViewRecorder`, `createDefaultBlogViewRecorder` | `CommunityViewRecorder`, `CommunityPostViewRateLimitError`, `recordCommunityPostView`, `createCommunityViewRecorder`, `createDefaultCommunityViewRecorder` |
| cache keys `blog-index`, `blog-slugs`, `blog-post`, …                                                                             | `community-index`, `community-slugs`, `community-post`, …                                                                                                  |
| rate-limit keys `blog-view:*`                                                                                                     | `community-view:*`                                                                                                                                         |
| `BLOG_PAGE_SIZE`                                                                                                                  | `COMMUNITY_PAGE_SIZE`                                                                                                                                      |
| `AppProduct` `'blog'`                                                                                                             | `'community'`                                                                                                                                              |
| table `blog_categories`                                                                                                           | `community_categories`                                                                                                                                     |
| table `blog_tags`                                                                                                                 | `community_tags`                                                                                                                                           |
| join tables `post_categories`, `post_tags`                                                                                        | keep (domain noun `post`)                                                                                                                                  |
| column `posts.blog_visible`                                                                                                       | `posts.community_visible`                                                                                                                                  |
| policy `blog_categories_select`                                                                                                   | `community_categories_select`                                                                                                                              |
| policy `blog_tags_select`                                                                                                         | `community_tags_select`                                                                                                                                    |
| index `idx_blog_tags_user_id`                                                                                                     | `idx_community_tags_user_id`                                                                                                                               |
| index `idx_posts_published_feed` (uses `blog_visible`)                                                                            | redefine on `community_visible`                                                                                                                            |
| storage bucket `post-images`                                                                                                      | keep (domain noun `post`)                                                                                                                                  |
| MCP tools `royaraqamia_blog_*`                                                                                                    | `royaraqamia_community_*`                                                                                                                                  |
| MCP scope group `Blog`                                                                                                            | `Community`                                                                                                                                                |

## Staged execution

Each stage ends with the verification gate. Do not start a stage before the
previous gate passes.

### Stage 1 — Contracts and cache tags (foundation)

Files: `shared/contracts/blog.ts` → `community.ts`,
`backend/shared/blog-cache-tags.ts` → `community-cache-tags.ts`.

- Rename the files (`git mv`) and update every import path across the repo,
  including BlogPress files that import `@/shared/contracts/blog`.
- Fix the `blog-cache-tags` comment ("Public blog post slug" → "Public community post slug").
- Update `shared/contracts/__tests__/blog-schema.test.ts` → `community-schema.test.ts`.

**Gate:** `npx tsc --noEmit`; `npx vitest run shared`.

### Stage 2 — Backend identifiers

Files: `backend/loaders/`, `backend/controllers/`, `backend/config/`,
`backend/services/blogpress/blog-view-recorder.ts`.

- `git mv` the four files; rename exported identifiers per the map.
- Update `backend/controllers/blogpress.ts` imports (`BLOG_MUTATION_TAGS` → `COMMUNITY_MUTATION_TAGS`)
  and its revalidation hints: `/blog/${slug}` → `/community/${slug}`, `/blog` → `/community`.
- Rename rate-limit key prefixes and Sentry messages.
- Update tests: `backend/controllers/__tests__/blog.test.ts`,
  `backend/transport/__tests__/http-result.test.ts`,
  `backend/services/blogpress/__tests__/blog-view-recorder.test.ts`,
  `backend/config/__tests__/notifiers.test.ts`.

**Gate:** `npx tsc --noEmit`; `npm test` (backend suites).

### Stage 3 — Public routes and UI

- `git mv app/blog app/community`; `git mv app/api/blog app/api/community`.
- Rename components/identifiers (`BlogPage` → `CommunityPage`, etc.) and all
  `/blog` hrefs inside them.
- Update every emitted `/blog` href outside the routes:
  `frontend/ui/Navbar.tsx`, `frontend/ui/app-shell/command-palette.tsx`,
  `frontend/ui/app-shell/constants.ts` (`AppProduct`), `frontend/ui/WhatsAppFloat.tsx`
  hide lists, `shared/contracts/push.ts:57`,
  `app/blogpress/_components/post-list.tsx:528`,
  `app/blogpress/editor/[id]/editor-content.tsx:243`,
  `frontend/ui/blogpress/post-settings-dialog.tsx` (URL preview + breadcrumb),
  `frontend/ui/blogpress/editor-side-panel.tsx` (breadcrumb),
  `next.config.js:90`, `app/sitemap.ts:29`.
- Update the PostCard Tailwind `group/blog` → `group/community` (and its modifiers).
- Update tests: `WhatsAppFloat.test.tsx`, `post-card.test.tsx`,
  `shared/__tests__/safe-redirect.test.ts`, `push-contract.test.ts`,
  `scripts/__tests__/perf-baseline.test.mjs`.

**Gate:** `npx tsc --noEmit`; `npm run lint`; `npm test`; `npm run build`.

### Stage 4 — Database migration

Pre-step: read the live schema to capture base objects absent from the repo
(`posts`, `post_status`, `update_posts_updated_at`). Write one additive,
idempotent migration `supabase/migrations/<ts>_rename_blog_to_community.sql`:

```sql
-- tables
alter table public.blog_categories rename to community_categories;
alter table public.blog_tags       rename to community_tags;
-- column
alter table public.posts rename column blog_visible to community_visible;
-- indexes
alter index public.idx_blog_tags_user_id rename to idx_community_tags_user_id;
-- drop + recreate the partial feed index on the new column name
drop index if exists public.idx_posts_published_feed;
create index idx_posts_published_feed on public.posts (published_at desc)
  where status = 'published' and community_visible;
-- policies: rename and re-point the USING clauses to community_visible
--   community_categories_select, community_tags_select,
--   post_categories_select, post_tags_select
-- FKs / unique constraints follow the table rename automatically.
```

- Recreate the four effective select policies with corrected references and new
  names (drop old names first). Also fix the two pre-existing policy bugs found
  during inventory (`pc.category_id = p.id` and `pt.tag_id = p.id`, which
  compare a FK to the post id).
- Update `backend/models/database.types.ts`: table keys, `blog_visible` column,
  FK `referencedRelation` names, `blog_categories`/`blog_tags` names.
- Update `backend/repositories/blogpress/posts.ts` and
  `shared/contracts/blogpress.ts` for `community_categories`, `community_tags`,
  `community_visible`.
- `supabase/tests/rls_authorization_test.sql` has no blog references — no change.

**Gate:** migration applied to a branch DB; RLS tests pass; loader/repository
integration tests pass; `npx tsc --noEmit`.

### Stage 5 — Copy and docs

- `CONTEXT.md` (add a **Community** glossary entry, note `blog` is retired),
  `AGENTS.md`, `README.md`, `docs/performance.md`, `app/global.css` comments,
  `.github/workflows/*` scope examples.
- CHANGELOG: do not rewrite history; add a new "Changed" entry only.

**Gate:** `npm run lint`; docs review.

### Stage 6 — MCP external contracts (separate, breaking)

`blog.read` / `blog.write` scopes are already issued in OAuth tokens and
`royaraqamia_blog_*` tool names are consumed by external clients. Treat this as
its own decision:

- **Option A (recommended):** add `community.read`/`community.write` as new
  scopes/tools, keep `blog.*` as deprecated aliases for one release, migrate
  clients, then remove.
- **Option B:** hard rename and force every client to re-auth.

**Gate:** scope/tool tests updated; a documented migration note; explicit
approval before merging.

## Risk register

| Risk                                                | Mitigation                                                                           |
| --------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Base schema only exists remotely                    | Dump live schema before Stage 4; never hand-edit the stub                            |
| `/blog` bookmarks and SEO equity lost (no redirect) | Accepted. Optionally add a 301 later via `next.config.js`                            |
| Cache tags change → stale ISR                       | `COMMUNITY_TAGS` must change in loaders and controllers in the same commit (Stage 2) |
| MCP token breakage                                  | Stage 6 is isolated and gated                                                        |
| BlogPress imports public contract                   | Stage 1 must update BlogPress imports too                                            |
| Large mechanical diff hides real breakage           | Stage gates: tsc after each, full test at Stages 2–4                                 |

## Verification (global)

Run after every stage: `npx tsc --noEmit`. Run before declaring done:
`npm run lint && npm test && npm run build`. DB stages additionally require the
RLS suite and a loader smoke test against the migrated branch.
