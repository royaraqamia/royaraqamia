-- ============================================================
-- A message may carry a drawing the assistant wrote in code (ADR-0215)
--
-- The SVG is a render payload, never queried: the page rasterizes it into a PNG
-- at display time, and a thread reopened tomorrow shows the same picture.
-- Nullable and unindexed on purpose. A member's own rows never carry it, and
-- the column is not exposed to a wider reader than the message it belongs to.
--
-- Rollback:
--   alter table public.chat_messages drop column if exists visual_svg;
-- ============================================================

alter table public.chat_messages
  add column if not exists visual_svg jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'chat_messages_visual_svg_object'
  ) then
    alter table public.chat_messages
      add constraint chat_messages_visual_svg_object
      check (visual_svg is null or jsonb_typeof(visual_svg) = 'object');
  end if;
end;
$$;
