-- ============================================================
-- Avatar storage bucket
--
-- Backs the profile-image editor (app/account). Members upload a single image
-- under their own `auth.uid()` folder; the public URL is written to
-- `public.users.avatar_url` (already a user-writable column, see
-- 20260917074407_lock_down_public_users_writes.sql).
--
-- Objects are keyed `<user-id>/<uuid>.<ext>` so the folder-namespaced insert
-- policy below scopes writes to the uploader. Reads are public (the avatar is
-- rendered on community pages), so no SELECT policy is needed on top of the
-- public bucket.
-- ============================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  true,
  5242880, -- 5MB
  ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif']
)
ON CONFLICT (id) DO NOTHING;

-- Authenticated members may only write inside their own `<uid>/` folder.
CREATE POLICY "Authenticated users can upload their own avatar" ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'avatars' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can update their own avatar" ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (bucket_id = 'avatars' AND owner = auth.uid())
  WITH CHECK (bucket_id = 'avatars' AND owner = auth.uid());

CREATE POLICY "Users can delete their own avatar" ON storage.objects
  FOR DELETE
  TO authenticated
  USING (bucket_id = 'avatars' AND owner = auth.uid());
