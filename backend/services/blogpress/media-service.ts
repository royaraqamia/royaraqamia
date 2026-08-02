import type { IMediaRepository } from '@/backend/repositories/blogpress/media-repository';

export class BlogpressMediaService {
  constructor(private readonly repository: IMediaRepository) {}

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

    if (file.size > 5 * 1024 * 1024) {
      return { error: 'يجب أن يكون الملف أقل من 5 ميغابايت' };
    }

    const ext = file.name.split('.').pop();
    const fileName = `${userId}/${crypto.randomUUID()}.${ext}`;

    return this.repository.uploadImage('post-images', fileName, file);
  }
}
