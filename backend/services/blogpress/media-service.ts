import type { MediaRepository } from '@/backend/repositories/blogpress/media-repository';
import { logger } from '@/backend/shared/logger';
import {
  POST_IMAGE_QUOTA_REFUSALS,
  type PostImageQuotaReason,
} from '@/backend/shared/post-image-quota';

const SVG_MIME_TYPE = 'image/svg+xml';
const SVG_FILE_EXTENSIONS = ['.svg', '.svgz'];

/** The bucket's ceiling, and the route's pre-buffer ceiling, from one number. */
export const POST_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

/** The image references a post holds, in the shape both clients store them. */
export interface PostMediaSnapshot {
  content: string | null;
  coverImage: string | null;
}

/** A public object URL ends at the first URL/markdown delimiter. */
const POST_IMAGE_PATH = /\/post-images\/([^)\s"'<>?#]+)/g;

function postImagePaths(snapshot: PostMediaSnapshot | null): Set<string> {
  const paths = new Set<string>();
  if (!snapshot) return paths;

  for (const text of [snapshot.content, snapshot.coverImage]) {
    if (!text) continue;
    for (const match of text.matchAll(POST_IMAGE_PATH)) {
      const path = match[1];
      if (path) paths.add(path);
    }
  }
  return paths;
}

// `post-images` is public and Storage serves an object under the type it was
// stored with, so an SVG would be a script-executing URL on the storage origin.
// The bucket allowlist rejects SVG as well (20261018120000_reject_svg_from_post_images_bucket.sql);
// the declared type and the extension are both checked here so a client that
// mislabels the file cannot slip past the bucket setting.
function isSvgUpload(file: File): boolean {
  if (file.type.toLowerCase() === SVG_MIME_TYPE) {
    return true;
  }

  const name = file.name.toLowerCase();
  return SVG_FILE_EXTENSIONS.some((extension) => name.endsWith(extension));
}

export class BlogpressMediaService {
  constructor(private readonly repository: MediaRepository) {}

  async uploadImage(
    formData: FormData,
    userId: string
  ): Promise<{ url: string } | { error: string }> {
    const file = formData.get('file') as File;
    if (!file) {
      return { error: 'لم يتم توفير ملف' };
    }

    if (!file.type.startsWith('image/')) {
      return { error: 'يجب أن يكون الملف صورة' };
    }

    if (isSvgUpload(file)) {
      return { error: 'صيغة الصُّورة غير مدعومة' };
    }

    if (file.size > POST_IMAGE_MAX_BYTES) {
      return { error: 'يجب أن يكون الملف أقل من 5 ميغابايت' };
    }

    // A preflight, not the authority: the trigger in 20261219000000 reads the
    // size Storage recorded and is what actually bounds the bucket. This answer
    // arrives in the product's voice before a doomed upload starts.
    const usage = await this.repository.usage();
    if (usage.memberBytes + file.size > usage.memberLimitBytes) {
      return { error: POST_IMAGE_QUOTA_REFUSALS['post image member storage is full'] };
    }
    if (usage.projectBytes + file.size > usage.projectLimitBytes) {
      return { error: POST_IMAGE_QUOTA_REFUSALS['post image project storage is full'] };
    }

    const ext = file.name.split('.').pop();
    const fileName = `${userId}/${crypto.randomUUID()}.${ext}`;

    const result = await this.repository.uploadImage('post-images', fileName, file);
    if ('error' in result) {
      const reason: PostImageQuotaReason | undefined = result.reason;
      return { error: reason ? POST_IMAGE_QUOTA_REFUSALS[reason] : result.error };
    }
    return result;
  }

  /**
   * Give an orphaned object its life cycle. A post that is tombstoned, or an edit
   * that swaps its cover, no longer references the bytes; leaving the object
   * published would charge them to the member's cap forever.
   *
   * `after` is the state that survives the write — null for a delete. Only the
   * caller's own folder is touched, so a URL another member wrote cannot be
   * removed through a post payload. A failed removal is reported, not fatal:
   * the post write has already succeeded and must not be rolled back by Storage.
   */
  async deleteOrphanedImages(
    before: PostMediaSnapshot | null,
    after: PostMediaSnapshot | null,
    userId: string
  ): Promise<void> {
    const kept = postImagePaths(after);
    const orphaned = [...postImagePaths(before)].filter(
      (path) => !kept.has(path) && path.startsWith(`${userId}/`)
    );

    for (const path of orphaned) {
      try {
        await this.repository.deleteImage('post-images', path);
      } catch (error) {
        logger.error('Could not remove an orphaned post image', { path, error });
      }
    }
  }
}
