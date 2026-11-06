-- ============================================================
-- A receipt per item, so a digest only reports what is new
--
-- `telegram_digests` is a receipt per *run*: it stops the same run being
-- summarised twice, and it did that correctly. What it never did was stop the
-- same issue or pull request appearing in two different digests, because each
-- digest re-read a fixed 24-hour window. The owner saw the same seventeen lines
-- several times a day.
--
-- `telegram_digest_items` is the receipt per *item*: one row per
-- `(kind, number)` holding the state that was reported - `created` for an
-- issue, `merged` / `closed` / `open` for a pull request. A digest renders only
-- the `(item, state)` pairs the table does not hold yet, sends, and writes the
-- receipts after the send. An item that changes state is news again (a pull
-- that is open and then merges), and an item that does not change is silent.
--
-- `telegram_state.digest_items_seeded` marks the one-time seed: everything
-- visible when this shipped is written as already reported, so the change does
-- not replay the window it replaced. A key rather than "the table is empty",
-- because a quiet repository has nothing to seed and would re-seed forever,
-- swallowing the first item that ever arrived.
--
-- Rollback:
--   drop table if exists public.telegram_digest_items;
--   delete from public.telegram_state where key = 'digest_items_seeded';
-- ============================================================

create table if not exists public.telegram_digest_items (
  kind text not null,
  number bigint not null,
  state text not null,
  sent_at timestamptz not null default now(),
  primary key (kind, number)
);

alter table public.telegram_digest_items enable row level security;

revoke all on public.telegram_digest_items from anon, authenticated;
grant all on public.telegram_digest_items to service_role;
