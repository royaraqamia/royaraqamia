import { describe, it, expect, vi } from 'vitest';
import { BlogpressPostsService } from '@/backend/services/blogpress/posts-service';
import type { PostsRepository } from '@/backend/repositories/blogpress/posts-repository';
import type { PostPublishedNotifier } from '@/backend/config/notifications';
import type { RestorePostSnapshot } from '@/shared/contracts/blogpress';

function makeRepo(
  overrides: Partial<PostsRepository> = {},
  onPostPublished?: PostPublishedNotifier
) {
  const repository: PostsRepository = {
    getPublishedPosts: vi.fn(),
    getPublishedFeed: vi.fn(),
    getFollowingFeed: vi.fn(),
    getFeaturedPublishedByAuthor: vi.fn(),
    getPublishedPostSlugs: vi.fn(),
    getPublishedPostSitemapEntries: vi.fn(),
    getPublishedPostBySlug: vi.fn(),
    getPostAuthor: vi.fn(),
    getPostAuthors: vi.fn(),
    getPublishedAuthorIds: vi.fn(),
    setPostSource: vi.fn(),
    getPublishedCategories: vi.fn(),
    getPublishedPostCategories: vi.fn(),
    incrementPostViewCount: vi.fn(),
    listPostsByAuthor: vi.fn(),
    listPostsByAuthorIncludingDeleted: vi.fn(),
    getPostForUser: vi.fn(),
    getPostByClientId: vi.fn(),
    getPostExcerptById: vi.fn(),
    createPost: vi.fn(),
    createAndPublishPost: vi.fn(),
    updatePost: vi.fn(),
    saveAndPublishPost: vi.fn(),
    publishPost: vi.fn(),
    unpublishPost: vi.fn(),
    schedulePost: vi.fn(),
    deletePost: vi.fn(),
    restorePost: vi.fn(),
    setPostFeatured: vi.fn(),
    bulkActionPosts: vi.fn(),
    resolveBulkPublishTargets: vi.fn(),
    countPostsInStatus: vi.fn(),
    bulkSetPostCategories: vi.fn(),
    listCategoriesByAuthor: vi.fn(),
    createCategory: vi.fn(),
    deleteCategory: vi.fn(),
    getPostCategories: vi.fn(),
    setPostCategories: vi.fn(),
    getPublishedPostTags: vi.fn(),
    listTagsByAuthor: vi.fn(),
    createTag: vi.fn(),
    deleteTag: vi.fn(),
    getPostTags: vi.fn(),
    getPostTagsByPostIds: vi.fn(),
    setPostTags: vi.fn(),
    ...overrides,
  };
  return {
    repository,
    service: new BlogpressPostsService(repository, onPostPublished),
  };
}

const postData = { slug: 'post-1' };

const snapshotBase = {
  id: 'p-1',
  slug: 'post-1',
  updatedAt: '2026-08-02T09:00:00.000Z',
};

describe('BlogpressPostsService publish visibility', () => {
  it('publishes through save-and-publish', async () => {
    const { repository, service } = makeRepo();
    (repository.saveAndPublishPost as ReturnType<typeof vi.fn>).mockResolvedValue({
      slug: 'post-1',
    });

    await expect(service.saveAndPublishPost('p-1', 'u-1', postData)).resolves.toEqual({
      slug: 'post-1',
    });
    expect(repository.saveAndPublishPost).toHaveBeenCalledWith('p-1', 'u-1', postData);
  });

  it('creates and publishes a new post in one repository call', async () => {
    const { repository, service } = makeRepo();
    (repository.createAndPublishPost as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'p-9',
      slug: 'post-abc12345',
    });

    await expect(service.createAndPublishPost('u-1', postData)).resolves.toEqual({
      id: 'p-9',
      slug: 'post-abc12345',
    });
    expect(repository.createAndPublishPost).toHaveBeenCalledWith('u-1', postData);
  });

  it('publishes through publish', async () => {
    const { repository, service } = makeRepo();
    (repository.publishPost as ReturnType<typeof vi.fn>).mockResolvedValue({ slug: 'post-1' });

    await expect(service.publishPost('p-1', 'u-1')).resolves.toEqual({ slug: 'post-1' });
    expect(repository.publishPost).toHaveBeenCalledWith('p-1', 'u-1');
  });

  it('reports the published post to the follower notifier', async () => {
    const onPostPublished = vi.fn();
    const { repository, service } = makeRepo({}, onPostPublished);
    (repository.createAndPublishPost as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 'p-9',
      slug: 'post-abc12345',
    });

    await service.createAndPublishPost('u-1', postData);

    expect(onPostPublished).toHaveBeenCalledWith({
      postId: 'p-9',
      authorId: 'u-1',
      slug: 'post-abc12345',
    });
  });

  it('does not notify on a bulk publish', async () => {
    const onPostPublished = vi.fn();
    const { repository, service } = makeRepo({}, onPostPublished);
    (repository.bulkActionPosts as ReturnType<typeof vi.fn>).mockResolvedValue({
      affected: 1,
      slugs: ['post-1'],
    });

    await service.bulkActionPosts(['p-1'], 'u-1', 'publish');

    expect(onPostPublished).not.toHaveBeenCalled();
  });

  it('delegates bulk publish to the repository', async () => {
    const { repository, service } = makeRepo();
    (repository.bulkActionPosts as ReturnType<typeof vi.fn>).mockResolvedValue({
      affected: 2,
      slugs: ['post-1', 'post-2'],
    });

    await service.bulkActionPosts(['p-1', 'p-2'], 'u-1', 'publish');
    expect(repository.bulkActionPosts).toHaveBeenCalledWith(['p-1', 'p-2'], 'u-1', 'publish');
  });

  it('delegates bulk unpublish to the repository', async () => {
    const { repository, service } = makeRepo();
    (repository.bulkActionPosts as ReturnType<typeof vi.fn>).mockResolvedValue({
      affected: 1,
      slugs: ['post-1'],
    });

    await service.bulkActionPosts(['p-1'], 'u-1', 'unpublish');
    expect(repository.bulkActionPosts).toHaveBeenCalledWith(['p-1'], 'u-1', 'unpublish');
  });
});

describe('BlogpressPostsService.createDraft', () => {
  it('creates the draft with the member as author and no source for typed text', async () => {
    const { repository, service } = makeRepo();
    (repository.createPost as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'p-9' });

    await expect(
      service.createDraft('u-1', {
        slug: 'post-abc12345',
        content: 'نصٌّ كتبه العضو',
        metaTitle: 'عنوان',
      })
    ).resolves.toEqual({ id: 'p-9' });

    expect(repository.createPost).toHaveBeenCalledWith('u-1', {
      slug: 'post-abc12345',
      content: 'نصٌّ كتبه العضو',
      meta_title: 'عنوان',
    });
    expect(repository.setPostSource).not.toHaveBeenCalled();
  });

  it('records the artifact a draft came from, scoped to the author', async () => {
    const { repository, service } = makeRepo();
    (repository.createPost as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'p-9' });

    await service.createDraft('u-1', {
      slug: 'post-abc12345',
      content: 'ملاحظة',
      metaTitle: 'ملاحظة',
      source: { kind: 'note', ref: 'n-1' },
    });

    expect(repository.setPostSource).toHaveBeenCalledWith('p-9', 'u-1', {
      kind: 'note',
      ref: 'n-1',
    });
  });

  it('propagates a repository failure without writing a marker', async () => {
    const { repository, service } = makeRepo();
    (repository.createPost as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('فشل إنشاء المنشور')
    );

    await expect(
      service.createDraft('u-1', {
        slug: 'post-abc12345',
        content: 'نصّ',
        metaTitle: 'عنوان',
        source: { kind: 'answer', ref: 'm-1' },
      })
    ).rejects.toThrow('فشل إنشاء المنشور');
    expect(repository.setPostSource).not.toHaveBeenCalled();
  });
});

describe('BlogpressPostsService.restorePost', () => {
  it('rejects a snapshot that names no tombstone', async () => {
    const { repository, service } = makeRepo();

    await expect(service.restorePost('u-1', {})).rejects.toThrow('معرِّف المنشور أو رابطه مطلوب');
    expect(repository.restorePost).not.toHaveBeenCalled();
  });

  it('revives through the repository with the handle and the stamp only', async () => {
    const { repository, service } = makeRepo();
    (repository.restorePost as ReturnType<typeof vi.fn>).mockResolvedValue({ slug: 'post-1' });

    await expect(service.restorePost('u-1', snapshotBase)).resolves.toEqual({ slug: 'post-1' });

    expect(repository.restorePost).toHaveBeenCalledWith('u-1', snapshotBase);
  });

  it('never forwards a body a caller tries to send back', async () => {
    const { repository, service } = makeRepo();
    (repository.restorePost as ReturnType<typeof vi.fn>).mockResolvedValue({ slug: 'post-1' });
    const forged = {
      ...snapshotBase,
      content: 'نصٌّ قديم كُتب قبل الحذف',
      cover_image: 'https://example.test/old.png',
      meta_title: 'عنوانٌ قديم',
      meta_desc: 'وصفٌ قديم',
      tagIds: ['t-1'],
      status: 'published',
      view_count: 999,
      featured: true,
    } as unknown as RestorePostSnapshot;

    await service.restorePost('u-1', forged);

    expect(repository.restorePost).toHaveBeenCalledWith('u-1', snapshotBase);
    expect(repository.setPostTags).not.toHaveBeenCalled();
  });

  it('finds the tombstone by slug when the caller has no id', async () => {
    const { repository, service } = makeRepo();
    (repository.restorePost as ReturnType<typeof vi.fn>).mockResolvedValue({ slug: 'post-1' });

    await service.restorePost('u-1', { slug: ' post-1 ' });

    expect(repository.restorePost).toHaveBeenCalledWith('u-1', { slug: 'post-1' });
  });

  it('propagates a repository failure', async () => {
    const { repository, service } = makeRepo();
    (repository.restorePost as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('فشل استرجاع المنشور')
    );

    await expect(service.restorePost('u-1', snapshotBase)).rejects.toThrow('فشل استرجاع المنشور');
  });
});
