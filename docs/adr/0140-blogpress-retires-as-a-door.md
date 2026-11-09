# BlogPress retires as a door, and the account's posts page becomes the authoring surface

Date: 2026-11-08
Status: Accepted

## Context

BlogPress shipped a dashboard (`/blogpress`), a calendar and a full editor, and
it was already hidden from `خدماتنا`. By then Community had a composer that
publishes in one dialog, and the account already had a posts page. Three doors
for one kind of content meant three places to keep the same rules — status,
plan caps, offline drafts, revalidation — and two of them were being used by
almost nobody. The editor's cover-image, SEO and tag panels were the only thing
it still added, and those are API/MCP concerns now.

## Decision

1. **One authoring surface: the composer.** The Community FAB and a new FAB on
   `/account/posts` open the same dialog. It creates, edits, saves a draft to
   the identity's Local Store, and schedules through the server's existing
   `schedule_post` transition (a pg_cron job publishes due rows). Publishing and
   scheduling stay online-only; a draft body queues offline (ADR-0027, ADR-0031).
2. **`/account/posts` is the management page.** It paints the same local-first
   store BlogPress used, so drafts written before this change are still there
   and their Outbox intents still replay. It adds the four analytics cards
   (total, published, scheduled, views), status tabs and search, bulk
   publish/unpublish/delete, duplicate, Markdown/HTML export, pin, and per-row
   publish/unpublish/delete-with-undo. Categories and tags leave the UI, their
   endpoints and MCP tools are removed, and the tables and columns stay.
3. **A pin belongs to its author's surfaces.** `featured` sorts first on
   `/account/posts` and `/u/[username]`, and the profile marks it. The Community
   feed keeps its chronological order and shows no pin, because it is everyone's
   page.
4. **Views are public, and only a detail open counts.** Every `PostCard` — the
   feed, the profile and the account list — shows `view_count`; the existing
   detail-page recorder is what increments it.
5. **The API keeps its handlers and gains a canonical path.** `/api/community/*`
   serves the same controllers; `/api/blogpress/*` stays as a thin alias until
   every installed APK has moved, and the Android client calls the new path.
   Internal module names (`backend/*/blogpress`, `shared/contracts/blogpress`,
   the local-store namespace) are deliberately unchanged: renaming HTTP paths
   does not require rewriting the storage keys a draft is filed under.
6. **The old URLs redirect.** `/blogpress/editor/:id` →
   `/account/posts?edit=:id`, `/blogpress/calendar` →
   `/account/posts?status=scheduled`, everything else under `/blogpress` →
   `/account/posts`.
7. **The native port is withdrawn.** The two off BlogPress screens and their
   parity rows are deleted; the Kotlin `blogpress` store stays because the
   Community editor and composer are built on it.

## Consequences

- The editor's cover-image, SEO and inline-image tools have no UI. Existing
  values keep rendering, and the API/MCP can still write them; a new post is
  body-first.
- The schedule picker is Umm al-Qura, like every date the site renders, and
  stores an ISO instant.
- Categories and tags remain in the database for existing rows, but no client
  can list, create or assign them through the API any more.
- `/api/blogpress/*` was debt with an end date: it existed for the installed APKs,
  not for the web, and it left on 2026-11-09 (#1167) once no build the update
  channel could still reach called it.

## Amendment (2026-11-09, #1167): the alias left

`/api/blogpress/*`, its `/api/blogpress` service-worker entry and the test that
named it are gone. No released APK ever called the alias: `android-1.2.0`
(2026-11-02) predates the Kotlin `blogpress` store, whose write transport went
straight to `/api/community/*`, and no cut was published between those two
dates. The web has requested `/api/community/*` since the change that minted the
alias. The internal names stay — `backend/*/blogpress`,
`shared/contracts/blogpress`, the Kotlin store and `frontend/api/blogpress` —
because they file storage keys and modules, not HTTP paths.
