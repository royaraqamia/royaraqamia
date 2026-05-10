-- Create push_subscriptions table
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  endpoint TEXT NOT NULL UNIQUE,
  keys JSONB NOT NULL,
  user_agent TEXT,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  is_active BOOLEAN DEFAULT true
);

-- Create index on endpoint for faster lookups
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_endpoint ON push_subscriptions(endpoint);

-- Create index on is_active for filtering active subscriptions
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_active ON push_subscriptions(is_active);

-- Enable Row Level Security
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (for re-running migration)
DROP POLICY IF EXISTS "Allow insert subscriptions" ON push_subscriptions;
DROP POLICY IF EXISTS "Allow update subscriptions" ON push_subscriptions;
DROP POLICY IF EXISTS "Allow delete subscriptions" ON push_subscriptions;
DROP POLICY IF EXISTS "Allow service role to read subscriptions" ON push_subscriptions;
DROP POLICY IF EXISTS "Allow users to read own subscriptions" ON push_subscriptions;

-- Allow anon and authenticated users to insert subscriptions (for public PWA)
CREATE POLICY "Allow insert subscriptions" ON push_subscriptions
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

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

-- Only allow service role to read all subscriptions (for sending notifications)
CREATE POLICY "Allow service role to read subscriptions" ON push_subscriptions
  FOR SELECT
  TO service_role
  USING (true);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS update_push_subscriptions_updated_at ON push_subscriptions;

-- Create trigger to automatically update updated_at
CREATE TRIGGER update_push_subscriptions_updated_at
  BEFORE UPDATE ON push_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
