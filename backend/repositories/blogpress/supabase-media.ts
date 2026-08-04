import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/backend/models/database.types';
import type { MediaRepository } from '@/backend/repositories/blogpress/media-repository';

export function createMediaRepository(supabase: SupabaseClient<Database>): MediaRepository {
  return {
    async uploadImage(bucketName, fileName, file) {
      const { error } = await supabase.storage.from(bucketName).upload(fileName, file, {
        cacheControl: '3600',
        upsert: false,
      });

      if (error) {
        return { error: 'فشل رفع الصورة' };
      }

      const { data: urlData } = supabase.storage.from(bucketName).getPublicUrl(fileName);

      return { url: urlData.publicUrl };
    },
  };
}
