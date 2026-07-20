'use server';

import { cookies } from 'next/headers';
import { createClient } from '@/lib/supabase/server';
import { verifySession } from '@/domains/blogpress/lib/dal';

async function uploadToBucket(bucketName: string, formData: FormData, userId: string) {
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);

  const file = formData.get('file') as File;
  if (!file) {
    return { error: 'لم يتم توفير ملف' };
  }

  if (!file.type.startsWith('image/')) {
    return { error: 'يجب أن يكون الملف صورة' };
  }

  if (file.size > 5 * 1024 * 1024) {
    return { error: 'يجب أن يكون الملف أقل من 5 ميغابايت' };
  }

  const ext = file.name.split('.').pop();
  const fileName = `${userId}/${crypto.randomUUID()}.${ext}`;

  const { error } = await supabase.storage.from(bucketName).upload(fileName, file, {
    cacheControl: '3600',
    upsert: false,
  });

  if (error) {
    return { error: 'فشل رفع الصورة' };
  }

  const { data: urlData } = supabase.storage.from(bucketName).getPublicUrl(fileName);

  return { url: urlData.publicUrl };
}

export async function uploadImage(formData: FormData) {
  const session = await verifySession();
  return uploadToBucket('post-images', formData, session.userId);
}
