import sharp from 'sharp';
import { describe, it, expect, vi } from 'vitest';
import { BlogpressMediaService } from '@/backend/services/blogpress/media-service';
import type { MediaRepository } from '@/backend/repositories/blogpress/media-repository';
import { IMAGE_PIXEL_REFUSAL } from '@/shared/contracts/images';

function makeRepo(overrides: Partial<MediaRepository> = {}) {
  const repository: MediaRepository = {
    uploadImage: vi.fn(),
    deleteImage: vi.fn(),
    usage: vi.fn().mockResolvedValue({
      memberBytes: 0,
      memberLimitBytes: 100 * 1024 * 1024,
      projectBytes: 0,
      projectLimitBytes: 500 * 1024 * 1024,
    }),
    ...overrides,
  };
  return { repository, service: new BlogpressMediaService(repository) };
}

const imageUrl = (path: string) =>
  `https://example.supabase.co/storage/v1/object/public/post-images/${path}`;

function buildForm(file: File | null): FormData {
  const fd = new FormData();
  if (file) fd.append('file', file);
  return fd;
}

const TINY_PNG = await sharp({
  create: { width: 2, height: 2, channels: 3, background: '#ffffff' },
})
  .png()
  .toBuffer();

function makeFile({
  name = 'photo.png',
  type = 'image/png',
  size,
}: {
  name?: string;
  type?: string;
  size?: number;
} = {}) {
  const bytes = size === undefined ? TINY_PNG : new Uint8Array(size);
  return new File([bytes], name, { type });
}

/** A valid image padded to the byte boundary, to check the byte cap separately. */
function paddedFile(size: number): File {
  const bytes = Buffer.concat([Buffer.from(TINY_PNG), Buffer.alloc(size - TINY_PNG.length)]);
  return new File([bytes], 'photo.png', { type: 'image/png' });
}

describe('BlogpressMediaService.uploadImage', () => {
  it('uploads a valid image and returns the URL', async () => {
    const { repository, service } = makeRepo();
    (repository.uploadImage as ReturnType<typeof vi.fn>).mockResolvedValue({ url: 'https://cdn' });

    const file = makeFile();
    const result = await service.uploadImage(buildForm(file), 'user-123');

    expect(result).toEqual({ url: 'https://cdn' });
    expect(repository.uploadImage).toHaveBeenCalledWith(
      'post-images',
      expect.stringContaining('user-123/'),
      expect.any(File)
    );
  });

  it('builds a filename with the correct extension and uuid', async () => {
    const { repository, service } = makeRepo();
    (repository.uploadImage as ReturnType<typeof vi.fn>).mockResolvedValue({ url: 'https://cdn' });

    const file = makeFile({ name: 'my-photo.jpeg', type: 'image/jpeg' });
    await service.uploadImage(buildForm(file), 'user-123');

    const [, fileName] = (repository.uploadImage as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      string,
    ];
    expect(fileName).toMatch(/^user-123\/[0-9a-f-]{36}\.webp$/);
  });

  it('returns an error when no file is provided', async () => {
    const { repository, service } = makeRepo();
    const result = await service.uploadImage(buildForm(null), 'user-123');
    expect(result).toEqual({ error: 'لم يتم توفير ملف' });
    expect(repository.uploadImage).not.toHaveBeenCalled();
  });

  it('rejects a non-image file type', async () => {
    const { repository, service } = makeRepo();
    const file = makeFile({ name: 'doc.pdf', type: 'application/pdf' });
    const result = await service.uploadImage(buildForm(file), 'user-123');
    expect(result).toEqual({ error: 'يجب أن يكون الملف صورة' });
    expect(repository.uploadImage).not.toHaveBeenCalled();
  });

  it('rejects a file declared as image/svg+xml', async () => {
    const { repository, service } = makeRepo();
    const file = makeFile({ name: 'icon.svg', type: 'image/svg+xml' });
    const result = await service.uploadImage(buildForm(file), 'user-123');
    expect(result).toEqual({ error: 'صيغة الصُّورة غير مدعومة' });
    expect(repository.uploadImage).not.toHaveBeenCalled();
  });

  it('rejects an .svg name even when the declared type claims a raster format', async () => {
    const { repository, service } = makeRepo();
    const file = makeFile({ name: 'icon.svg', type: 'image/png' });
    const result = await service.uploadImage(buildForm(file), 'user-123');
    expect(result).toEqual({ error: 'صيغة الصُّورة غير مدعومة' });
    expect(repository.uploadImage).not.toHaveBeenCalled();
  });

  it('rejects an .svgz name', async () => {
    const { repository, service } = makeRepo();
    const file = makeFile({ name: 'icon.svgz', type: 'image/png' });
    const result = await service.uploadImage(buildForm(file), 'user-123');
    expect(result).toEqual({ error: 'صيغة الصُّورة غير مدعومة' });
    expect(repository.uploadImage).not.toHaveBeenCalled();
  });

  it('rejects an SVG whatever the casing', async () => {
    const { repository, service } = makeRepo();
    const file = makeFile({ name: 'icon.SVG', type: 'image/SVG+XML' });
    const result = await service.uploadImage(buildForm(file), 'user-123');
    expect(result).toEqual({ error: 'صيغة الصُّورة غير مدعومة' });
    expect(repository.uploadImage).not.toHaveBeenCalled();
  });

  it.each(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif'])(
    'still accepts %s',
    async (type) => {
      const { repository, service } = makeRepo();
      (repository.uploadImage as ReturnType<typeof vi.fn>).mockResolvedValue({
        url: 'https://cdn',
      });
      const extension = type.replace('image/', '');
      const file = makeFile({ name: `photo.${extension}`, type });
      const result = await service.uploadImage(buildForm(file), 'user-123');
      expect(result).toEqual({ url: 'https://cdn' });
      expect(repository.uploadImage).toHaveBeenCalledTimes(1);
    }
  );

  it('rejects a file exactly over the 5MB limit', async () => {
    const { repository, service } = makeRepo();
    const file = makeFile({ size: 5 * 1024 * 1024 + 1 });
    const result = await service.uploadImage(buildForm(file), 'user-123');
    expect(result).toEqual({ error: 'يجب أن يكون الملف أقل من 5 ميغابايت' });
    expect(repository.uploadImage).not.toHaveBeenCalled();
  });

  it('accepts a file exactly at the 5MB boundary', async () => {
    const { repository, service } = makeRepo();
    (repository.uploadImage as ReturnType<typeof vi.fn>).mockResolvedValue({ url: 'https://cdn' });
    const file = paddedFile(5 * 1024 * 1024);
    const result = await service.uploadImage(buildForm(file), 'user-123');
    expect(result).toEqual({ url: 'https://cdn' });
  });

  it('refuses an upload over the pixel ceiling even when its bytes are small', async () => {
    const { repository, service } = makeRepo();
    const large = await sharp({
      create: { width: 4000, height: 3001, channels: 3, background: '#ffffff' },
    })
      .png()
      .toBuffer();
    expect(large.byteLength).toBeLessThan(5 * 1024 * 1024);

    const result = await service.uploadImage(
      buildForm(new File([large], 'cover.png', { type: 'image/png' })),
      'user-123'
    );

    expect(result).toEqual({ error: IMAGE_PIXEL_REFUSAL });
    expect(repository.uploadImage).not.toHaveBeenCalled();
  });

  it('stores a web-sized derivative of an oversized source', async () => {
    const { repository, service } = makeRepo();
    (repository.uploadImage as ReturnType<typeof vi.fn>).mockResolvedValue({ url: 'https://cdn' });
    const large = await sharp({
      create: { width: 3000, height: 2000, channels: 3, background: '#ffffff' },
    })
      .png()
      .toBuffer();

    await service.uploadImage(
      buildForm(new File([large], 'cover.png', { type: 'image/png' })),
      'user-123'
    );

    const stored = (repository.uploadImage as ReturnType<typeof vi.fn>).mock.calls[0]?.[2] as File;
    const metadata = await sharp(new Uint8Array(await stored.arrayBuffer())).metadata();
    expect(Math.max(metadata.width ?? 0, metadata.height ?? 0)).toBeLessThanOrEqual(2400);
    expect(stored.name).toBe('cover.webp');
  });

  it('handles a file with no extension', async () => {
    const { repository, service } = makeRepo();
    (repository.uploadImage as ReturnType<typeof vi.fn>).mockResolvedValue({ url: 'https://cdn' });
    const file = makeFile({ name: 'image', type: 'image/png' });
    const result = await service.uploadImage(buildForm(file), 'user-123');
    expect(result).toEqual({ url: 'https://cdn' });
  });

  it('passes through an error from the repository', async () => {
    const { repository, service } = makeRepo();
    (repository.uploadImage as ReturnType<typeof vi.fn>).mockResolvedValue({
      error: 'فشل رفع الصورة',
    });
    const result = await service.uploadImage(buildForm(makeFile()), 'user-123');
    expect(result).toEqual({ error: 'فشل رفع الصورة' });
  });

  it('refuses an upload that would take the member past its cap', async () => {
    const { repository, service } = makeRepo({
      usage: vi.fn().mockResolvedValue({
        memberBytes: 100 * 1024 * 1024 - 1,
        memberLimitBytes: 100 * 1024 * 1024,
        projectBytes: 0,
        projectLimitBytes: 500 * 1024 * 1024,
      }),
    });

    const result = await service.uploadImage(buildForm(makeFile()), 'user-123');

    expect(result).toEqual({
      error: 'تخزين صورك ممتلئ، احذف صورة قديمة ثم أعد المحاولة',
    });
    expect(repository.uploadImage).not.toHaveBeenCalled();
  });

  it('refuses an upload that would take the project past its cap', async () => {
    const { repository, service } = makeRepo({
      usage: vi.fn().mockResolvedValue({
        memberBytes: 0,
        memberLimitBytes: 100 * 1024 * 1024,
        projectBytes: 500 * 1024 * 1024 - 1,
        projectLimitBytes: 500 * 1024 * 1024,
      }),
    });

    const result = await service.uploadImage(buildForm(makeFile()), 'user-123');

    expect(result).toEqual({ error: 'تخزين الصور في الموقع ممتلئ، حاول لاحقاً' });
    expect(repository.uploadImage).not.toHaveBeenCalled();
  });

  it.each([
    ['post image member storage is full', 'تخزين صورك ممتلئ، احذف صورة قديمة ثم أعد المحاولة'],
    ['post image project storage is full', 'تخزين الصور في الموقع ممتلئ، حاول لاحقاً'],
  ])('names the trigger refusal "%s" in the product voice', async (reason, sentence) => {
    const { service } = makeRepo({
      uploadImage: vi.fn().mockResolvedValue({ error: 'فشل رفع الصورة', reason }),
    });

    const result = await service.uploadImage(buildForm(makeFile()), 'user-123');

    expect(result).toEqual({ error: sentence });
  });
});

describe('BlogpressMediaService.deleteOrphanedImages', () => {
  const BEFORE = {
    content: `![cover](${imageUrl('user-123/old.png')}) ![kept](${imageUrl('user-123/kept.png')})`,
    coverImage: imageUrl('user-123/old-cover.png'),
  };

  it('removes every image a deleted post held', async () => {
    const { repository, service } = makeRepo();

    await service.deleteOrphanedImages(BEFORE, null, 'user-123');

    expect(repository.deleteImage).toHaveBeenCalledWith('post-images', 'user-123/old.png');
    expect(repository.deleteImage).toHaveBeenCalledWith('post-images', 'user-123/kept.png');
    expect(repository.deleteImage).toHaveBeenCalledWith('post-images', 'user-123/old-cover.png');
  });

  it('keeps the images an edited post still references and removes the replaced cover', async () => {
    const { repository, service } = makeRepo();

    await service.deleteOrphanedImages(
      BEFORE,
      {
        content: `![kept](${imageUrl('user-123/kept.png')})`,
        coverImage: imageUrl('user-123/new-cover.png'),
      },
      'user-123'
    );

    expect(repository.deleteImage).toHaveBeenCalledTimes(2);
    expect(repository.deleteImage).toHaveBeenCalledWith('post-images', 'user-123/old.png');
    expect(repository.deleteImage).toHaveBeenCalledWith('post-images', 'user-123/old-cover.png');
    expect(repository.deleteImage).not.toHaveBeenCalledWith('post-images', 'user-123/kept.png');
  });

  it('never removes an object outside the caller folder', async () => {
    const { repository, service } = makeRepo();

    await service.deleteOrphanedImages(
      {
        content: `![other](${imageUrl('user-999/theirs.png')})`,
        coverImage: null,
      },
      null,
      'user-123'
    );

    expect(repository.deleteImage).not.toHaveBeenCalled();
  });
});
