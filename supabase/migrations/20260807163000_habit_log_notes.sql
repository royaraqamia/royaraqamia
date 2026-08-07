-- habit_log_notes: per-log journal entry — "why / how I felt" for emotional anchoring.
alter table public.habit_logs add column if not exists note text;