import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/backend/models/database.types';

export const AVATARS_BUCKET = 'avatars';

export interface AvatarStorageRepository {
  /** Store the image under the caller's folder and return its public URL. */
  upload(userId: string, file: File): Promise<string>;
  /** Delete a previously stored avatar by its public URL. Unknown URLs are ignored. */
  remove(url: string): Promise<void>;
}

export function createAvatarStorageRepository(
  supabase: SupabaseClient<Database>
): AvatarStorageRepository {
  return {
    async upload(userId, file) {
      const extension = file.name.split('.').pop()?.toLowerCase() || 'png';
      const fileName = `${userId}/${crypto.randomUUID()}.${extension}`;

      const { error } = await supabase.storage.from(AVATARS_BUCKET).upload(fileName, file, {
        cacheControl: '3600',
        upsert: false,
        contentType: file.type,
      });
      if (error) throw error;

      const { data } = supabase.storage.from(AVATARS_BUCKET).getPublicUrl(fileName);
      return data.publicUrl;
    },

    async remove(url) {
      const path = extractAvatarPath(url);
      if (!path) return;
      await supabase.storage.from(AVATARS_BUCKET).remove([path]);
    },
  };
}

/** Pull the object path out of a public bucket URL, or null if it is not ours. */
function extractAvatarPath(url: string): string | null {
  const marker = `/storage/v1/object/public/${AVATARS_BUCKET}/`;
  try {
    const { pathname } = new URL(url);
    const index = pathname.indexOf(marker);
    if (index === -1) return null;
    return decodeURIComponent(pathname.slice(index + marker.length));
  } catch {
    return null;
  }
}
