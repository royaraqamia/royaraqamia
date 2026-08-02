'use server';

import { cookies } from 'next/headers';
import { createClient } from '@/backend/transport/supabase/server';
import { verifySession } from '@/backend/middleware/session-guard';
import { createBlogpressMediaService } from '@/backend/config/blogpress';

export async function uploadImage(formData: FormData) {
  const session = await verifySession();
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);
  const service = createBlogpressMediaService(supabase);

  return service.uploadImage(formData, session.userId);
}
