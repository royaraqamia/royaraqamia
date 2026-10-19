-- Certificate recipient reads filter the array column with containment, in two
-- places that both scan public.certificates today:
--
--   - the RLS policy "Recipients can read their own certificates"
--     (20261014105746_narrow_certificate_public_read.sql) uses
--     `recipient_user_ids @> array[(select auth.uid())]`, which runs for every
--     authenticated read of the table;
--   - backend/repositories/certificates/index.ts listByRecipient uses
--     .contains('recipient_user_ids', [userId]).
--
-- recipient_user_ids (20260817035947_add_certificate_recipient_user_ids.sql) is
-- uuid[] with no GIN index, so both predicates are sequential scans whose cost
-- grows with every issued Certificate. A GIN index on the array column serves
-- the @> operator used by both.
--
-- The policy predicates and the schema are unchanged; this only adds the index.
--
-- Rollback:
--   drop index if exists public.idx_certificates_recipient_user_ids;

create index if not exists idx_certificates_recipient_user_ids
  on public.certificates using gin (recipient_user_ids);
