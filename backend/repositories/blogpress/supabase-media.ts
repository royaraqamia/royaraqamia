import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/backend/models/database.types';
import type {
  MediaRepository,
  MediaUploadResult,
  MediaUsage,
} from '@/backend/repositories/blogpress/media-repository';
import { postImageQuotaReason } from '@/backend/shared/post-image-quota';
import { repositoryFailure } from '@/backend/shared/repository-error';

export function createMediaRepository(supabase: SupabaseClient<Database>): MediaRepository {
  return {
    async uploadImage(bucketName, fileName, file): Promise<MediaUploadResult> {
      const { error } = await supabase.storage.from(bucketName).upload(fileName, file, {
        cacheControl: '3600',
        upsert: false,
      });

      if (error) {
        // A quota refusal is a domain answer with a product sentence; anything
        // else is the same generic failure the composer has always shown.
        const reason = postImageQuotaReason(error.message);
        return { error: 'فشل رفع الصورة', ...(reason ? { reason } : {}) };
      }

      const { data: urlData } = supabase.storage.from(bucketName).getPublicUrl(fileName);

      return { url: urlData.publicUrl };
    },

    async deleteImage(bucketName, fileName) {
      const { error } = await supabase.storage.from(bucketName).remove([fileName]);
      if (error) throw repositoryFailure('media.deleteImage', error);
    },

    async usage(): Promise<MediaUsage> {
      const { data, error } = await supabase.rpc('post_image_allowance');
      if (error) throw repositoryFailure('media.usage', error);

      const row = (data ?? [])[0];
      if (!row) throw repositoryFailure('media.usage', 'no allowance row');

      return {
        memberBytes: Number(row.member_used_bytes),
        memberLimitBytes: Number(row.member_limit_bytes),
        projectBytes: Number(row.project_used_bytes),
        projectLimitBytes: Number(row.project_limit_bytes),
      };
    },
  };
}
