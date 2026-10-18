import type { MediaRepository } from '@/backend/repositories/blogpress/media-repository';

const SVG_MIME_TYPE = 'image/svg+xml';
const SVG_FILE_EXTENSIONS = ['.svg', '.svgz'];

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

    if (file.size > 5 * 1024 * 1024) {
      return { error: 'يجب أن يكون الملف أقل من 5 ميغابايت' };
    }

    const ext = file.name.split('.').pop();
    const fileName = `${userId}/${crypto.randomUUID()}.${ext}`;

    return this.repository.uploadImage('post-images', fileName, file);
  }
}
