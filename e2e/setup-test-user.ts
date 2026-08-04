import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { logger } from '@/shared/logger';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function ensureTestUser() {
  const email = process.env.E2E_TEST_EMAIL!;
  const password = process.env.E2E_TEST_PASSWORD!;

  // Check if user exists
  const { data: users } = await supabase.auth.admin.listUsers();
  const existing = users?.users?.find((u) => u.email === email);

  if (existing) {
    // Update password in case it changed
    await supabase.auth.admin.updateUserById(existing.id, { password });
    console.log(`Test user already exists: ${email} (id: ${existing.id})`);
    return;
  }

  // Create the user with confirmed email
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (error) {
    logger.error('Failed to create test user', { error: error.message });
    process.exit(1);
  }

  console.log(`Created test user: ${email} (id: ${data.user.id})`);
}

ensureTestUser();
