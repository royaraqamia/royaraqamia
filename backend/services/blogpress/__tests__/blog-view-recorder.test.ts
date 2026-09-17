import { describe, it, expect, vi } from 'vitest';
import {
  createBlogViewRecorder,
  BlogPostViewRateLimitError,
  type BlogViewRecorderDeps,
} from '@/backend/services/blogpress/blog-view-recorder';
import type { PostsRepository } from '@/backend/repositories/blogpress/posts-repository';

function makeDeps(overrides: Partial<BlogViewRecorderDeps> = {}) {
  const repository: Pick<PostsRepository, 'getPublishedPostBySlug' | 'incrementPostViewCount'> = {
    getPublishedPostBySlug: vi.fn(),
    incrementPostViewCount: vi.fn(),
  };

  const checkRateLimit = vi.fn<BlogViewRecorderDeps['checkRateLimit']>(async () => true);
  const captureMessage = vi.fn<BlogViewRecorderDeps['captureMessage']>();

  return {
    repository,
    checkRateLimit,
    captureMessage,
    recorder: createBlogViewRecorder({
      repository,
      checkRateLimit,
      captureMessage,
      ...overrides,
    }),
  };
}

describe('BlogViewRecorder', () => {
  it('rate limits per IP and does not touch the repository when exceeded', async () => {
    const { recorder, repository, captureMessage } = makeDeps({
      checkRateLimit: vi.fn(async (key: string) => !key.startsWith('blog-view:1.2.3.4')),
    });

    await expect(recorder.recordView('my-post', '1.2.3.4')).rejects.toBeInstanceOf(
      BlogPostViewRateLimitError
    );
    expect(repository.getPublishedPostBySlug).not.toHaveBeenCalled();
    expect(repository.incrementPostViewCount).not.toHaveBeenCalled();
    expect(captureMessage).toHaveBeenCalledWith(
      'Blog post view IP rate limit exceeded',
      expect.any(Object)
    );
  });

  it('rate limits per slug and does not touch the repository when exceeded', async () => {
    const { recorder, repository, captureMessage } = makeDeps({
      checkRateLimit: vi.fn(async (key: string) => !key.includes('my-post')),
    });

    await expect(recorder.recordView('my-post', '9.9.9.9')).rejects.toBeInstanceOf(
      BlogPostViewRateLimitError
    );
    expect(repository.getPublishedPostBySlug).not.toHaveBeenCalled();
    expect(repository.incrementPostViewCount).not.toHaveBeenCalled();
    expect(captureMessage).toHaveBeenCalledWith(
      'Blog post view slug rate limit exceeded',
      expect.any(Object)
    );
  });

  it('resolves the post by slug before incrementing', async () => {
    const { recorder, repository } = makeDeps();
    (repository.getPublishedPostBySlug as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'p-1',
    });

    await recorder.recordView('my-post', '1.2.3.4');

    expect(repository.getPublishedPostBySlug).toHaveBeenCalledWith('my-post');
    expect(repository.incrementPostViewCount).toHaveBeenCalledWith('p-1');
  });

  it('does not increment when the slug does not resolve to a published post', async () => {
    const { recorder, repository } = makeDeps();
    (repository.getPublishedPostBySlug as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await recorder.recordView('missing-post', '1.2.3.4');

    expect(repository.incrementPostViewCount).not.toHaveBeenCalled();
  });
});
