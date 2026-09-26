import { describe, it, expect, vi } from 'vitest';
import {
  BlogpressPostsService,
  type PostPublishedNotifier,
} from '@/backend/services/blogpress/posts-service';
import type { PostsRepository } from '@/backend/repositories/blogpress/posts-repository';
import { createPostPublishedNotifier } from '@/backend/config/blogpress';
import { createNotificationFanout } from '@/backend/config/notifications';
import type { Post } from '@/shared/contracts/blogpress';

const postFixture = {
  id: 'p-1',
  author_id: 'u-1',
  title: 'مقال',
  slug: 'post-1',
  content: null,
  status: 'published',
  cover_image: null,
  meta_title: null,
  meta_desc: null,
  published_at: '2026-08-01T00:00:00.000Z',
  publish_at: null,
  view_count: 3,
  featured: false,
  blog_visible: true,
  created_at: '2026-08-01T00:00:00.000Z',
  updated_at: '2026-08-01T00:00:00.000Z',
} as unknown as Post;

function makeRepo(
  overrides: Partial<PostsRepository> = {},
  onPostPublished?: PostPublishedNotifier
) {
  const repository: PostsRepository = {
    getPublishedPosts: vi.fn(),
    getPublishedPostSlugs: vi.fn(),
    getPublishedPostBySlug: vi.fn(),
    getPostAuthor: vi.fn(),
    getPublishedCategories: vi.fn(),
    getPublishedPostCategories: vi.fn(),
    incrementPostViewCount: vi.fn(),
    listPostsByAuthor: vi.fn(),
    getPostForUser: vi.fn(),
    getPostTitleById: vi.fn(),
    createPost: vi.fn(),
    updatePost: vi.fn(),
    saveAndPublishPost: vi.fn(),
    publishPost: vi.fn(),
    unpublishPost: vi.fn(),
    schedulePost: vi.fn(),
    deletePost: vi.fn(),
    restorePost: vi.fn(),
    setPostFeatured: vi.fn(),
    bulkActionPosts: vi.fn(),
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
    service: new BlogpressPostsService(repository, ['admin@example.com'], onPostPublished),
  };
}

const postData = { title: 'مقال', slug: 'post-1' };

const snapshotBase = {
  title: 'مقال',
  slug: 'post-1',
  content: null,
  status: 'draft' as const,
  cover_image: null,
  meta_title: null,
  meta_desc: null,
  published_at: null,
  publish_at: null,
  view_count: 0,
  featured: false,
  blog_visible: true,
  reading_time_minutes: 0,
};

describe('BlogpressPostsService visibility rule', () => {
  it('stores blog visibility on save-and-publish for an admin', async () => {
    const { repository, service } = makeRepo();
    (repository.saveAndPublishPost as ReturnType<typeof vi.fn>).mockResolvedValue({
      slug: 'post-1',
    });

    await expect(
      service.saveAndPublishPost('p-1', 'u-1', postData, 'admin@example.com')
    ).resolves.toEqual({ slug: 'post-1' });
    expect(repository.saveAndPublishPost).toHaveBeenCalledWith('p-1', 'u-1', postData, true);
  });

  it('hides a non-admin save-and-publish from the blog', async () => {
    const { repository, service } = makeRepo();
    (repository.saveAndPublishPost as ReturnType<typeof vi.fn>).mockResolvedValue({
      slug: 'post-1',
    });

    await service.saveAndPublishPost('p-1', 'u-1', postData, 'user@example.com');
    expect(repository.saveAndPublishPost).toHaveBeenCalledWith('p-1', 'u-1', postData, false);
  });

  it('stores blog visibility on publish for an admin', async () => {
    const { repository, service } = makeRepo();
    (repository.publishPost as ReturnType<typeof vi.fn>).mockResolvedValue({ slug: 'post-1' });

    await expect(service.publishPost('p-1', 'u-1', 'admin@example.com')).resolves.toEqual({
      slug: 'post-1',
    });
    expect(repository.publishPost).toHaveBeenCalledWith('p-1', 'u-1', true);
  });

  it('hides a non-admin publish from the blog', async () => {
    const { repository, service } = makeRepo();
    (repository.publishPost as ReturnType<typeof vi.fn>).mockResolvedValue({ slug: 'post-1' });

    await service.publishPost('p-1', 'u-1', 'user@example.com');
    expect(repository.publishPost).toHaveBeenCalledWith('p-1', 'u-1', false);
  });

  it('gates a bulk publish on the same admin rule', async () => {
    const { repository, service } = makeRepo();
    (repository.bulkActionPosts as ReturnType<typeof vi.fn>).mockResolvedValue({
      affected: 2,
      slugs: ['post-1', 'post-2'],
    });

    await service.bulkActionPosts(['p-1', 'p-2'], 'u-1', 'publish', 'admin@example.com');
    expect(repository.bulkActionPosts).toHaveBeenCalledWith(['p-1', 'p-2'], 'u-1', 'publish', true);

    await service.bulkActionPosts(['p-1', 'p-2'], 'u-1', 'publish', 'user@example.com');
    expect(repository.bulkActionPosts).toHaveBeenLastCalledWith(
      ['p-1', 'p-2'],
      'u-1',
      'publish',
      false
    );
  });

  it('leaves the visibility flag undefined for non-publish bulk actions', async () => {
    const { repository, service } = makeRepo();
    (repository.bulkActionPosts as ReturnType<typeof vi.fn>).mockResolvedValue({
      affected: 1,
      slugs: ['post-1'],
    });

    await service.bulkActionPosts(['p-1'], 'u-1', 'unpublish', 'admin@example.com');
    expect(repository.bulkActionPosts).toHaveBeenCalledWith(['p-1'], 'u-1', 'unpublish', undefined);
  });
});

describe('BlogpressPostsService publish notifier', () => {
  it('fires after save-and-publish', async () => {
    const onPostPublished = vi.fn();
    const { repository, service } = makeRepo({}, onPostPublished);
    (repository.saveAndPublishPost as ReturnType<typeof vi.fn>).mockResolvedValue({
      slug: 'post-1',
    });

    await service.saveAndPublishPost('p-1', 'u-1', postData, 'user@example.com');

    expect(onPostPublished).toHaveBeenCalledWith({
      postId: 'p-1',
      authorId: 'u-1',
      slug: 'post-1',
    });
  });

  it('fires after publish', async () => {
    const onPostPublished = vi.fn();
    const { repository, service } = makeRepo({}, onPostPublished);
    (repository.publishPost as ReturnType<typeof vi.fn>).mockResolvedValue({ slug: 'post-1' });

    await service.publishPost('p-1', 'u-1', 'user@example.com');

    expect(onPostPublished).toHaveBeenCalledWith({
      postId: 'p-1',
      authorId: 'u-1',
      slug: 'post-1',
    });
  });

  it('does not fire when publish fails', async () => {
    const onPostPublished = vi.fn();
    const { repository, service } = makeRepo({}, onPostPublished);
    (repository.publishPost as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('db down'));

    await expect(service.publishPost('p-1', 'u-1', 'user@example.com')).rejects.toThrow('db down');
    expect(onPostPublished).not.toHaveBeenCalled();
  });

  it('still returns the published slug when the fan-out delivery fails', async () => {
    const broadcast = vi.fn(async () => {
      throw new Error('notifications down');
    });
    const onPostPublished = createPostPublishedNotifier(
      createNotificationFanout({
        deliver: { broadcast },
        push: { sendToUsers: async () => undefined },
        resolveAdminIds: async () => ['admin-1'],
        schedule: (task) => {
          void task();
        },
      })
    );
    const { repository, service } = makeRepo({}, onPostPublished);
    (repository.publishPost as ReturnType<typeof vi.fn>).mockResolvedValue({ slug: 'post-1' });

    await expect(service.publishPost('p-1', 'u-1', 'user@example.com')).resolves.toEqual({
      slug: 'post-1',
    });
    await vi.waitFor(() => expect(broadcast).toHaveBeenCalledTimes(1));
  });
});

describe('BlogpressPostsService.restorePost', () => {
  it('rejects a snapshot without a title or slug', async () => {
    const { repository, service } = makeRepo();

    await expect(service.restorePost('u-1', { ...snapshotBase, title: '  ' })).rejects.toThrow(
      'عنوان المقال مطلوب'
    );
    await expect(service.restorePost('u-1', { ...snapshotBase, slug: ' ' })).rejects.toThrow(
      'المعرّف (slug) مطلوب'
    );
    expect(repository.restorePost).not.toHaveBeenCalled();
  });

  it('hides a non-admin restore and re-attaches the snapshot tags', async () => {
    const { repository, service } = makeRepo();
    (repository.restorePost as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'p-2' });
    (repository.setPostTags as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    await expect(
      service.restorePost('u-1', { ...snapshotBase, tagIds: ['t-1', 't-2'] }, 'user@example.com')
    ).resolves.toEqual({ id: 'p-2' });

    expect(repository.restorePost).toHaveBeenCalledWith(
      'u-1',
      expect.objectContaining({ blog_visible: false })
    );
    expect(repository.setPostTags).toHaveBeenCalledWith('p-2', 'u-1', ['t-1', 't-2']);
  });

  it('keeps blog visibility for an admin restore', async () => {
    const { repository, service } = makeRepo();
    (repository.restorePost as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'p-2' });

    await service.restorePost('u-1', snapshotBase, 'admin@example.com');

    expect(repository.restorePost).toHaveBeenCalledWith(
      'u-1',
      expect.objectContaining({ blog_visible: true })
    );
  });

  it('skips tag re-attachment when the snapshot has no tags', async () => {
    const { repository, service } = makeRepo();
    (repository.restorePost as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'p-2' });

    await service.restorePost('u-1', snapshotBase, 'user@example.com');

    expect(repository.setPostTags).not.toHaveBeenCalled();
  });

  it('propagates a repository failure', async () => {
    const { repository, service } = makeRepo();
    (repository.restorePost as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('فشل استرجاع المقال')
    );

    await expect(service.restorePost('u-1', snapshotBase)).rejects.toThrow('فشل استرجاع المقال');
  });
});

describe('BlogpressPostsService.duplicatePost', () => {
  it('clones fields, tags and categories into a fresh draft', async () => {
    const { repository, service } = makeRepo();
    (repository.getPostForUser as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...postFixture,
      title: 'مقال مميز',
      content: '# محتوى',
      cover_image: 'https://img/cover.png',
      meta_title: 'عنوان SEO',
      meta_desc: 'وصف',
    });
    (repository.createPost as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'p-copy' });
    (repository.updatePost as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    (repository.getPostTags as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 'tag-1', name: 'تقنية', slug: 'tech' },
    ]);
    (repository.setPostTags as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    (repository.getPostCategories as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 'cat-1', name: 'أخبار', slug: 'news' },
    ]);
    (repository.setPostCategories as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

    const result = await service.duplicatePost('p-1', 'u-1');

    expect(result).toEqual({ id: 'p-copy' });
    expect(repository.createPost).toHaveBeenCalledWith('u-1');
    expect(repository.updatePost).toHaveBeenCalledWith(
      'p-copy',
      'u-1',
      expect.objectContaining({
        title: 'نسخة من مقال مميز',
        content: '# محتوى',
        cover_image: 'https://img/cover.png',
        meta_title: 'عنوان SEO',
        meta_desc: 'وصف',
        slug: expect.stringMatching(/^post-1-copy-[a-z0-9]{4}$/),
      })
    );
    expect(repository.setPostTags).toHaveBeenCalledWith('p-copy', 'u-1', ['tag-1']);
    expect(repository.setPostCategories).toHaveBeenCalledWith('p-copy', 'u-1', ['cat-1']);
  });

  it('throws when the source post does not exist or is not owned', async () => {
    const { repository, service } = makeRepo();
    (repository.getPostForUser as ReturnType<typeof vi.fn>).mockResolvedValue(null);

    await expect(service.duplicatePost('p-1', 'u-2')).rejects.toThrow('المقال غير موجود');
    expect(repository.createPost).not.toHaveBeenCalled();
  });
});
