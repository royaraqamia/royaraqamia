-- Create notification_history table
CREATE TABLE IF NOT EXISTS notification_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  icon TEXT,
  url TEXT,
  target_type TEXT DEFAULT 'all', -- 'all', 'user', 'segment'
  target_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  sent_count INTEGER DEFAULT 0,
  failed_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  sent_at TIMESTAMP WITH TIME ZONE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Create index on created_at for sorting
CREATE INDEX IF NOT EXISTS idx_notification_history_created_at ON notification_history(created_at DESC);

-- Create index on target_user_id for filtering
CREATE INDEX IF NOT EXISTS idx_notification_history_target_user ON notification_history(target_user_id);

-- Enable Row Level Security
ALTER TABLE notification_history ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Allow service role to read notification history" ON notification_history;
DROP POLICY IF EXISTS "Allow service role to insert notification history" ON notification_history;
DROP POLICY IF EXISTS "Allow admins to read notification history" ON notification_history;
DROP POLICY IF EXISTS "Allow admins to insert notification history" ON notification_history;

-- Only allow service role to read all notification history
CREATE POLICY "Allow service role to read notification history" ON notification_history
  FOR SELECT
  TO service_role
  USING (true);

-- Only allow service role to insert notification history
CREATE POLICY "Allow service role to insert notification history" ON notification_history
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- Allow admins to read notification history (you'll need to create an admin role or check user metadata)
CREATE POLICY "Allow admins to read notification history" ON notification_history
  FOR SELECT
  TO authenticated
  USING (
    -- Check if user has admin role in user metadata
    (auth.jwt() ->> 'role') = 'admin'
    OR created_by = auth.uid()
  );

-- Allow admins to insert notification history
CREATE POLICY "Allow admins to insert notification history" ON notification_history
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (auth.jwt() ->> 'role') = 'admin'
  );
