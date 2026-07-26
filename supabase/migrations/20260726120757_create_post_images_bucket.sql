-- Create the post-images bucket
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'post-images',
  'post-images',
  true,
  5242880, -- 5MB
  ARRAY['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml', 'image/avif']
)
ON CONFLICT (id) DO NOTHING;

-- Allow public read access to objects in post-images
CREATE POLICY "Public read access for post-images" ON storage.objects
  FOR SELECT
  USING (bucket_id = 'post-images');

-- Allow authenticated users to upload images to post-images
CREATE POLICY "Authenticated users can upload to post-images" ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'post-images' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

-- Allow users to update their own images
CREATE POLICY "Users can update their own images" ON storage.objects
  FOR UPDATE
  TO authenticated
  USING (bucket_id = 'post-images' AND owner = auth.uid())
  WITH CHECK (bucket_id = 'post-images' AND owner = auth.uid());

-- Allow users to delete their own images
CREATE POLICY "Users can delete their own images" ON storage.objects
  FOR DELETE
  TO authenticated
  USING (bucket_id = 'post-images' AND owner = auth.uid());
