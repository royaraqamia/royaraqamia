-- ============================================================
-- Android shell storage bucket
--
-- Holds the signed release APKs that the site serves at
-- /android/royaraqamia-<version>.apk. The manifest the app follows
-- (`public/android/latest.json`) names that URL, so the download path a device
-- takes is: royaraqamia.com → this bucket (ADR-0047).
--
-- It exists because the APK used to live only on a GitHub release, and that host
-- is unreachable from at least one country this app has users in. An update that
-- cannot be downloaded is not an update. The GitHub release still carries the same
-- file as the permanent archive; nothing a device fetches depends on it.
--
-- Writes come from `npm run android:publish` in CI with the service role, which
-- bypasses RLS, so there is deliberately no INSERT policy here: the bucket is
-- world-readable and no signed-in user may write to it. Objects are named
-- `royaraqamia-<version>.apk` and are never overwritten — a version is immutable,
-- and the manifest carries the sha256 of the exact bytes it points at.
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'android',
  'android',
  true,
  52428800, -- 50MB: a universal APK is ~8MB today and only grows
  ARRAY['application/vnd.android.package-archive', 'application/octet-stream']
)
ON CONFLICT (id) DO NOTHING;
