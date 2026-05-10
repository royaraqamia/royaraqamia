-- Add user_id column to push_subscriptions table
ALTER TABLE push_subscriptions ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Drop existing policies
DROP POLICY IF EXISTS "Allow update subscriptions" ON push_subscriptions;
DROP POLICY IF EXISTS "Allow delete subscriptions" ON push_subscriptions;
DROP POLICY IF EXISTS "Allow users to read own subscriptions" ON push_subscriptions;

-- Allow authenticated users to update their own subscriptions
CREATE POLICY "Allow update subscriptions" ON push_subscriptions
  FOR UPDATE
  TO authenticated
  USING (auth.uid() IS NULL OR user_id = auth.uid());

-- Allow authenticated users to delete their own subscriptions
CREATE POLICY "Allow delete subscriptions" ON push_subscriptions
  FOR DELETE
  TO authenticated
  USING (auth.uid() IS NULL OR user_id = auth.uid());

-- Allow authenticated users to read their own subscriptions
CREATE POLICY "Allow users to read own subscriptions" ON push_subscriptions
  FOR SELECT
  TO authenticated
  USING (auth.uid() IS NULL OR user_id = auth.uid());
