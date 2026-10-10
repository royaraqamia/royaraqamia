-- Offline-first lead forms (ADR-0029, ticket #169).
--
-- The three non-inventory lead forms — Training Application, Project Request,
-- Retainer inquiry — accept a submission with the network off and replay it from
-- the Outbox on reconnection. Each replayed submit carries a client-minted
-- `client_id`, so the server can recognise a retry of a write that already
-- committed (a lost response) and return the existing row instead of inserting a
-- duplicate. Consultation Booking is deliberately out of scope: it reserves
-- Availability Slots and stays online-only (ADR-0031).
--
-- Leads are anonymous; attribution is opportunistic, so `client_id` is unique on
-- its own (no user scope). NULLs stay distinct under Postgres unique-index
-- semantics, so every pre-existing row is untouched.
--
-- Additive only.

alter table public.training_applications add column if not exists client_id uuid;
alter table public.project_requests add column if not exists client_id uuid;
alter table public.retainers add column if not exists client_id uuid;

create unique index if not exists training_applications_client_id_key
  on public.training_applications (client_id);
create unique index if not exists project_requests_client_id_key
  on public.project_requests (client_id);
create unique index if not exists retainers_client_id_key
  on public.retainers (client_id);
