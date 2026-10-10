-- download_jobs.format: widen the CHECK to the full Download Format vocabulary.
--
-- ADR-0025 fixes ten Download formats in the single flat enum DOWNLOAD_FORMATS
-- (shared/contracts/downloader.ts), but the table was created
-- (20261007171317_create_download_jobs.sql) with a CHECK naming only four of
-- them. The inspect step (ADR-0024) advertises the newer audio/image formats, so
-- a create with `audio-mp3`, `video-480p` or any `image-*` value raised a
-- Postgres check_violation inside SupabaseDownloadJobRepository.create and
-- surfaced to the visitor as a generic 500 instead of a working Download.
--
-- This drops the narrow constraint and re-adds it over all ten values. Widening
-- a CHECK only validates existing rows against the broader predicate, so every
-- current row already satisfies it. DOWNLOAD_FORMATS stays the single source of
-- truth; keep this list in sync with it (guarded by
-- backend/repositories/downloader/__tests__/supabase-download-job.test.ts).
--
-- Rollback (only valid while no row uses the newer formats):
--   alter table public.download_jobs
--     drop constraint if exists download_jobs_format_check;
--   alter table public.download_jobs
--     add constraint download_jobs_format_check
--     check (format in ('audio', 'video-360p', 'video-720p', 'video-1080p'));

alter table public.download_jobs
  drop constraint if exists download_jobs_format_check;

alter table public.download_jobs
  add constraint download_jobs_format_check
  check (
    format in (
      'audio',
      'audio-mp3',
      'video-360p',
      'video-480p',
      'video-720p',
      'video-1080p',
      'image-original',
      'image-jpg',
      'image-png',
      'image-webp'
    )
  );
