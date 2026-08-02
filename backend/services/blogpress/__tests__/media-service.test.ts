import { describe, it, expect, vi } from 'vitest';
import { BlogpressMediaService } from '@/backend/services/blogpress/media-service';
import type { IMediaRepository } from '@/backend/repositories/blogpress/media-repository';

function makeRepo(overrides: Partial<IMediaRepository> = {}) {
  const repository: IMediaRepository = {
    uploadImage: vi.fn(),
    ...overrides,
  };
  return { repository, service: new BlogpressMediaService(repository) };
}

function buildForm(file: File | null): FormData {
  const fd = new FormData();
  if (file) fd.append('file', file);
  return fd;
}

function makeFile({ name = 'photo.png', type = 'image/png', size = 1024 } = {}) {
  const blob = new Blob([new Uint8Array(size)], { type });
  return new File([blob], name, { type });
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
      file
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
    expect(fileName).toMatch(/^user-123\/[0-9a-f-]{36}\.jpeg$/);
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
    const file = makeFile({ size: 5 * 1024 * 1024 });
    const result = await service.uploadImage(buildForm(file), 'user-123');
    expect(result).toEqual({ url: 'https://cdn' });
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
});
