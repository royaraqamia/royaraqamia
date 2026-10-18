-- ============================================================
-- post-images: drop SVG from the allowed MIME types
--
-- The bucket is public, and Storage serves an object under the content type it
-- was stored with. Allowing `image/svg+xml` therefore handed every
-- authenticated uploader a script-executing URL on the storage origin
-- (a stored-XSS / phishing primitive), because an SVG can carry `<script>`.
--
-- The `avatars` bucket never allowed SVG
-- (20261011100000_create_avatars_bucket.sql); this brings `post-images` onto
-- the same raster-only list. `BlogpressMediaService.uploadImage` refuses SVG by
-- declared type and by file extension too, so this narrowing is defence in
-- depth rather than the only guard.
--
-- Existing SVG objects are left in place; this only stops new ones.
-- ============================================================

UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/avif'
]
WHERE id = 'post-images';
