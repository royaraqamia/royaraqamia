-- ============================================================
-- The last three unpinned functions in the plan-cap area (#782)
--
-- The Supabase security advisor still reports `function_search_path_mutable`
-- for three helpers, each of which runs its body against whatever path the
-- caller happened to have:
--
--   * `private.owned_item_is_active` — 20261023140000, the predicate the cap
--     triggers use to decide whether a row holds a slot;
--   * `private.guard_post_server_columns` — same migration, the trigger that
--     refuses a client write to the publication columns;
--   * `private.damascus_day_start` — 20261029120000, the boundary every daily
--     counted action flips on.
--
-- An inherited path means an unqualified operator or `pg_catalog` function can
-- resolve through a schema placed earlier in it, which is the class of problem
-- the advisor exists to flag. Nothing here is a live exploit: every body uses
-- only `pg_catalog` and its own arguments.
--
-- They are pinned to '' rather than 'public', which is what the neighbouring
-- SECURITY DEFINER helpers use: none of the three names an object in `public`,
-- so the narrower path is the honest one. An empty path still resolves
-- `pg_catalog` implicitly, which is all these bodies need —
--
--   * `owned_item_is_active` uses `->>`, `=`, `in` and `case`;
--   * `guard_post_server_columns` uses `NEW`/`OLD`, `current_user`, `coalesce`
--     (a keyword expression) and a numeric SQLSTATE;
--   * `damascus_day_start` uses `now()`, `date_trunc` and `AT TIME ZONE`.
--
-- Checked against the linked project inside a rolled-back transaction with the
-- caller's path emptied, so each body ran under exactly this path: the
-- predicate returned the same answers for a published row, a draft, a
-- scheduled draft, a tag and a tombstone; the guard still raised 42501 for an
-- `authenticated` INSERT that set `status`, and let a valid draft through; and
-- the day boundary matched the explicit `date_trunc('day', now() AT TIME ZONE
-- 'Asia/Damascus')` expression.
--
-- No body, grant, trigger or cap changes: `alter function … set` replaces only
-- the per-function GUC and leaves `proacl`, ownership and every caller
-- untouched.
--
-- Rollback:
--   alter function private.owned_item_is_active(text, jsonb) reset search_path;
--   alter function private.guard_post_server_columns() reset search_path;
--   alter function private.damascus_day_start() reset search_path;
-- ============================================================

alter function private.owned_item_is_active(text, jsonb) set search_path = '';

alter function private.guard_post_server_columns() set search_path = '';

alter function private.damascus_day_start() set search_path = '';
