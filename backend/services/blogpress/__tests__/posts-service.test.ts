import { describe, it, expect, vi } from 'vitest';
import {
  BlogpressPostsService,
  type PostPublishedNotifier,
} from '@/backend/services/blogpress/posts-service';
import type { PostsRepository } from '@/backend/repositories/blogpress/posts-repository';
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
    getPublishedPostBySlug: vi.fn(),
    getPostAuthor: vi.fn(),
    getRelatedPosts: vi.fn(),
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
    setPostTags: vi.fn(),
    ...overrides,
  };
  return {
    repository,
    service: new BlogpressPostsService(repository, ['admin@example.com'], onPostPublished),
  };
}

const postData = { title: 'مقال', slug: 'post-1' };

describe('BlogpressPostsService (thin delegation)', () => {
  it('delegates getPublishedPosts', async () => {
    const { repository, service } = makeRepo();
    (repository.getPublishedPosts as ReturnType<typeof vi.fn>).mockResolvedValue({
      posts: [postFixture],
      totalPages: 1,
    });
    await expect(service.getPublishedPosts(1, 'query', 10)).resolves.toEqual({
      posts: [postFixture],
      totalPages: 1,
    });
    expect(repository.getPublishedPosts).toHaveBeenCalledWith(1, 'query', 10, undefined);
  });

  it('delegates getPublishedPostBySlug and returns null for missing', async () => {
    const { repository, service } = makeRepo();
    (repository.getPublishedPostBySlug as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    await expect(service.getPublishedPostBySlug('nope')).resolves.toBeNull();
    expect(repository.getPublishedPostBySlug).toHaveBeenCalledWith('nope');
  });

  it('delegates getPostAuthor', async () => {
    const { repository, service } = makeRepo();
    (repository.getPostAuthor as ReturnType<typeof vi.fn>).mockResolvedValue({
      name: 'مؤلف',
      avatar_url: null,
      bio: null,
    });
    await service.getPostAuthor('u-1');
    expect(repository.getPostAuthor).toHaveBeenCalledWith('u-1');
  });

  it('delegates getRelatedPosts', async () => {
    const { repository, service } = makeRepo();
    (repository.getRelatedPosts as ReturnType<typeof vi.fn>).mockResolvedValue([postFixture]);
    await expect(service.getRelatedPosts('post-1')).resolves.toEqual([postFixture]);
    expect(repository.getRelatedPosts).toHaveBeenCalledWith('post-1');
  });

  it('delegates listPostsByAuthor', async () => {
    const { repository, service } = makeRepo();
    (repository.listPostsByAuthor as ReturnType<typeof vi.fn>).mockResolvedValue([postFixture]);
    await expect(service.listPostsByAuthor('u-1')).resolves.toEqual([postFixture]);
    expect(repository.listPostsByAuthor).toHaveBeenCalledWith('u-1', undefined);
  });

  it('delegates listPostsByAuthor with a category filter', async () => {
    const { repository, service } = makeRepo();
    (repository.listPostsByAuthor as ReturnType<typeof vi.fn>).mockResolvedValue([postFixture]);
    await service.listPostsByAuthor('u-1', 'tech');
    expect(repository.listPostsByAuthor).toHaveBeenCalledWith('u-1', 'tech');
  });

  it('delegates getPublishedPosts with a category filter', async () => {
    const { repository, service } = makeRepo();
    (repository.getPublishedPosts as ReturnType<typeof vi.fn>).mockResolvedValue({
      posts: [postFixture],
      totalPages: 1,
    });
    await service.getPublishedPosts(1, '', 10, 'tech');
    expect(repository.getPublishedPosts).toHaveBeenCalledWith(1, '', 10, 'tech');
  });

  it('delegates category methods', async () => {
    const { repository, service } = makeRepo();
    const category = { id: 'c-1', name: 'تقنية', slug: 'tech' };
    (repository.getPublishedCategories as ReturnType<typeof vi.fn>).mockResolvedValue([category]);
    (repository.getPublishedPostCategories as ReturnType<typeof vi.fn>).mockResolvedValue([
      category,
    ]);
    (repository.listCategoriesByAuthor as ReturnType<typeof vi.fn>).mockResolvedValue([category]);
    (repository.createCategory as ReturnType<typeof vi.fn>).mockResolvedValue(category);
    (repository.getPostCategories as ReturnType<typeof vi.fn>).mockResolvedValue([category]);

    await expect(service.getPublishedCategories()).resolves.toEqual([category]);
    await expect(service.getPublishedPostCategories('p-1')).resolves.toEqual([category]);
    await expect(service.listCategoriesByAuthor('u-1')).resolves.toEqual([category]);
    await expect(service.createCategory('u-1', 'تقنية', 'tech')).resolves.toEqual(category);
    expect(repository.createCategory).toHaveBeenCalledWith('u-1', 'تقنية', 'tech');

    await service.deleteCategory('c-1', 'u-1');
    expect(repository.deleteCategory).toHaveBeenCalledWith('c-1', 'u-1');

    await service.setPostCategories('p-1', 'u-1', ['c-1']);
    expect(repository.setPostCategories).toHaveBeenCalledWith('p-1', 'u-1', ['c-1']);

    await service.incrementPostViewCount('p-1');
    expect(repository.incrementPostViewCount).toHaveBeenCalledWith('p-1');
  });

  it('delegates tag methods', async () => {
    const { repository, service } = makeRepo();
    const tag = { id: 't-1', name: 'تقنية', slug: 'tech' };
    (repository.getPublishedPostTags as ReturnType<typeof vi.fn>).mockResolvedValue([tag]);
    (repository.listTagsByAuthor as ReturnType<typeof vi.fn>).mockResolvedValue([tag]);
    (repository.createTag as ReturnType<typeof vi.fn>).mockResolvedValue(tag);
    (repository.getPostTags as ReturnType<typeof vi.fn>).mockResolvedValue([tag]);

    await expect(service.getPublishedPostTags('p-1')).resolves.toEqual([tag]);
    await expect(service.listTagsByAuthor('u-1')).resolves.toEqual([tag]);
    await expect(service.createTag('u-1', 'تقنية', 'tech')).resolves.toEqual(tag);
    expect(repository.createTag).toHaveBeenCalledWith('u-1', 'تقنية', 'tech');
    await expect(service.getPostTags('p-1')).resolves.toEqual([tag]);

    await service.deleteTag('t-1', 'u-1');
    expect(repository.deleteTag).toHaveBeenCalledWith('t-1', 'u-1');

    await service.setPostTags('p-1', 'u-1', ['t-1']);
    expect(repository.setPostTags).toHaveBeenCalledWith('p-1', 'u-1', ['t-1']);
  });

  it('delegates getPostForUser', async () => {
    const { repository, service } = makeRepo();
    (repository.getPostForUser as ReturnType<typeof vi.fn>).mockResolvedValue(postFixture);
    await expect(service.getPostForUser('p-1', 'u-1')).resolves.toBe(postFixture);
    expect(repository.getPostForUser).toHaveBeenCalledWith('p-1', 'u-1');
  });

  it('delegates getPostTitleById', async () => {
    const { repository, service } = makeRepo();
    (repository.getPostTitleById as ReturnType<typeof vi.fn>).mockResolvedValue('مقال');
    await expect(service.getPostTitleById('p-1')).resolves.toBe('مقال');
  });

  it('delegates createPost', async () => {
    const { repository, service } = makeRepo();
    (repository.createPost as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'p-new' });
    await expect(service.createPost('u-1')).resolves.toEqual({ id: 'p-new' });
    expect(repository.createPost).toHaveBeenCalledWith('u-1');
  });

  it('delegates updatePost', async () => {
    const { repository, service } = makeRepo();
    (repository.updatePost as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    await service.updatePost('p-1', 'u-1', postData);
    expect(repository.updatePost).toHaveBeenCalledWith('p-1', 'u-1', postData);
  });

  it('delegates saveAndPublishPost with blog visibility for an admin', async () => {
    const { repository, service } = makeRepo();
    (repository.saveAndPublishPost as ReturnType<typeof vi.fn>).mockResolvedValue({
      slug: 'post-1',
    });
    await expect(
      service.saveAndPublishPost('p-1', 'u-1', postData, 'admin@example.com')
    ).resolves.toEqual({ slug: 'post-1' });
    expect(repository.saveAndPublishPost).toHaveBeenCalledWith('p-1', 'u-1', postData, true);
  });

  it('delegates saveAndPublishPost with blog visibility hidden for a non-admin', async () => {
    const { repository, service } = makeRepo();
    (repository.saveAndPublishPost as ReturnType<typeof vi.fn>).mockResolvedValue({
      slug: 'post-1',
    });
    await service.saveAndPublishPost('p-1', 'u-1', postData, 'user@example.com');
    expect(repository.saveAndPublishPost).toHaveBeenCalledWith('p-1', 'u-1', postData, false);
  });

  it('delegates publishPost / unpublishPost / deletePost', async () => {
    const { repository, service } = makeRepo();
    (repository.publishPost as ReturnType<typeof vi.fn>).mockResolvedValue({ slug: 'post-1' });
    (repository.unpublishPost as ReturnType<typeof vi.fn>).mockResolvedValue({ slug: 'post-1' });
    (repository.deletePost as ReturnType<typeof vi.fn>).mockResolvedValue({ slug: 'post-1' });

    await expect(service.publishPost('p-1', 'u-1', 'user@example.com')).resolves.toEqual({
      slug: 'post-1',
    });
    expect(repository.publishPost).toHaveBeenCalledWith('p-1', 'u-1', false);
    await expect(service.unpublishPost('p-1', 'u-1')).resolves.toEqual({ slug: 'post-1' });
    await expect(service.deletePost('p-1', 'u-1')).resolves.toEqual({ slug: 'post-1' });
  });

  it('delegates schedulePost with the target publish_at', async () => {
    const { repository, service } = makeRepo();
    (repository.schedulePost as ReturnType<typeof vi.fn>).mockResolvedValue({
      slug: 'post-1',
    });

    await service.schedulePost('p-1', 'u-1', '2026-09-01T09:00:00.000Z');

    expect(repository.schedulePost).toHaveBeenCalledWith('p-1', 'u-1', '2026-09-01T09:00:00.000Z');
  });

  it('fires the publish notifier after saveAndPublishPost', async () => {
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

  it('fires the publish notifier after publishPost', async () => {
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

  it('does not fire the publish notifier when publish fails', async () => {
    const onPostPublished = vi.fn();
    const { repository, service } = makeRepo({}, onPostPublished);
    (repository.publishPost as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('db down'));

    await expect(service.publishPost('p-1', 'u-1', 'user@example.com')).rejects.toThrow('db down');
    expect(onPostPublished).not.toHaveBeenCalled();
  });

  it('delegates setPostFeatured', async () => {
    const { repository, service } = makeRepo();
    (repository.setPostFeatured as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    await service.setPostFeatured('p-1', 'u-1', true);
    expect(repository.setPostFeatured).toHaveBeenCalledWith('p-1', 'u-1', true);
  });

  it('delegates bulk publish with blog_visible for admins', async () => {
    const { repository, service } = makeRepo();
    (repository.bulkActionPosts as ReturnType<typeof vi.fn>).mockResolvedValue({
      affected: 2,
      slugs: ['post-1', 'post-2'],
    });

    await service.bulkActionPosts(['p-1', 'p-2'], 'u-1', 'publish', 'admin@example.com');

    expect(repository.bulkActionPosts).toHaveBeenCalledWith(['p-1', 'p-2'], 'u-1', 'publish', true);
  });

  it('delegates bulk setCategory', async () => {
    const { repository, service } = makeRepo();
    (repository.bulkSetPostCategories as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
    await service.bulkSetPostCategories(['p-1', 'p-2'], 'u-1', 'cat-1');
    expect(repository.bulkSetPostCategories).toHaveBeenCalledWith(['p-1', 'p-2'], 'u-1', 'cat-1');
  });

  it('propagates repository errors', async () => {
    const { repository, service } = makeRepo();
    (repository.deletePost as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('db down'));
    await expect(service.deletePost('p-1', 'u-1')).rejects.toThrow('db down');
  });
});
