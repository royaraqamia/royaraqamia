-- BlogPress drafts join the offline write contract (ADR-0027 … ADR-0031, #168).
--
-- `posts` was deliberately left out of 20261010120000_offline_write_contract
-- because it keys ownership on `author_id` (not `user_id`) and its rows are
-- read by the shared Community feed. It now gains a client-minted id so an
-- Outbox replay is an idempotent write, plus a tombstone column so a delete
-- can replay without losing row identity.
--
-- Additive only. Legacy rows keep client_id = NULL; the unique index treats
-- NULLs as distinct, so pre-existing rows never collide.
--
-- The unconditional `updated_at` trigger is dropped so the client's logical
-- write time (ADR-0029 last-write-wins, clamped per ADR-0033) survives a
-- replay. Every write path now sets `updated_at` explicitly.

alter table public.posts add column if not exists client_id uuid;
alter table public.posts add column if not exists deleted_at timestamptz;

create unique index if not exists posts_author_id_client_id_key
  on public.posts (author_id, client_id);

drop trigger if exists update_posts_updated_at on public.posts;
