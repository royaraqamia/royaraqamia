import type { PostsRepository } from '@/backend/repositories/blogpress/posts-repository';
import type {
  Post,
  PostCategory,
  PostTag,
  PostAuthor,
  PublishedPostsResult,
} from '@/shared/contracts/blogpress';
import type { PostInput } from '@/shared/contracts/blog';
import { isAdmin } from '@/backend/shared/admin-validator';

export interface PostPublishedNotifier {
  (info: { postId: string; authorId: string; slug: string }): void;
}

export class BlogpressPostsService {
  constructor(
    private readonly repository: PostsRepository,
    private readonly adminEmails: string[],
    private readonly onPostPublished?: PostPublishedNotifier
  ) {}

  async getPublishedPosts(
    page: number,
    query: string,
    pageSize: number,
    categorySlug?: string
  ): Promise<PublishedPostsResult> {
    return this.repository.getPublishedPosts(page, query, pageSize, categorySlug);
  }

  async getPublishedPostBySlug(slug: string): Promise<Post | null> {
    return this.repository.getPublishedPostBySlug(slug);
  }

  async getPublishedPostSlugs(): Promise<string[]> {
    return this.repository.getPublishedPostSlugs();
  }

  async getPostAuthor(authorId: string): Promise<PostAuthor | null> {
    return this.repository.getPostAuthor(authorId);
  }

  async getRelatedPosts(slug: string): Promise<Post[]> {
    return this.repository.getRelatedPosts(slug);
  }

  async getPublishedCategories(): Promise<PostCategory[]> {
    return this.repository.getPublishedCategories();
  }

  async getPublishedPostCategories(postId: string): Promise<PostCategory[]> {
    return this.repository.getPublishedPostCategories(postId);
  }

  async incrementPostViewCount(postId: string): Promise<void> {
    return this.repository.incrementPostViewCount(postId);
  }

  async listPostsByAuthor(authorId: string, categorySlug?: string): Promise<Post[]> {
    return this.repository.listPostsByAuthor(authorId, categorySlug);
  }

  async getPostForUser(id: string, userId: string): Promise<Post | null> {
    return this.repository.getPostForUser(id, userId);
  }

  async getPostTitleById(id: string): Promise<string | null> {
    return this.repository.getPostTitleById(id);
  }

  async createPost(authorId: string): Promise<{ id: string }> {
    return this.repository.createPost(authorId);
  }

  async updatePost(postId: string, authorId: string, data: PostInput): Promise<void> {
    await this.repository.updatePost(postId, authorId, data);
  }

  async saveAndPublishPost(
    postId: string,
    authorId: string,
    data: PostInput,
    authorEmail: string
  ): Promise<{ slug: string }> {
    const blogVisible = isAdmin(authorEmail, this.adminEmails);
    const result = await this.repository.saveAndPublishPost(postId, authorId, data, blogVisible);
    this.onPostPublished?.({ postId, authorId, slug: result.slug });
    return result;
  }

  async publishPost(
    postId: string,
    authorId: string,
    authorEmail: string
  ): Promise<{ slug: string }> {
    const blogVisible = isAdmin(authorEmail, this.adminEmails);
    const result = await this.repository.publishPost(postId, authorId, blogVisible);
    this.onPostPublished?.({ postId, authorId, slug: result.slug });
    return result;
  }

  async unpublishPost(postId: string, authorId: string): Promise<{ slug: string }> {
    return this.repository.unpublishPost(postId, authorId);
  }

  async schedulePost(
    postId: string,
    authorId: string,
    publishAt: string
  ): Promise<{ slug: string }> {
    return this.repository.schedulePost(postId, authorId, publishAt);
  }

  async deletePost(postId: string, authorId: string): Promise<{ slug: string }> {
    return this.repository.deletePost(postId, authorId);
  }

  async bulkActionPosts(
    postIds: string[],
    authorId: string,
    action: 'publish' | 'unpublish' | 'delete',
    authorEmail?: string
  ): Promise<{ affected: number; slugs: string[] }> {
    const blogVisible =
      action === 'publish' ? isAdmin(authorEmail ?? '', this.adminEmails) : undefined;
    return this.repository.bulkActionPosts(postIds, authorId, action, blogVisible);
  }

  async bulkSetPostCategories(
    postIds: string[],
    authorId: string,
    categoryId: string
  ): Promise<void> {
    return this.repository.bulkSetPostCategories(postIds, authorId, categoryId);
  }

  async setPostFeatured(postId: string, authorId: string, featured: boolean): Promise<void> {
    return this.repository.setPostFeatured(postId, authorId, featured);
  }

  async listCategoriesByAuthor(authorId: string): Promise<PostCategory[]> {
    return this.repository.listCategoriesByAuthor(authorId);
  }

  async createCategory(authorId: string, name: string, slug: string): Promise<PostCategory> {
    return this.repository.createCategory(authorId, name, slug);
  }

  async deleteCategory(categoryId: string, authorId: string): Promise<void> {
    return this.repository.deleteCategory(categoryId, authorId);
  }

  async getPostCategories(postId: string): Promise<PostCategory[]> {
    return this.repository.getPostCategories(postId);
  }

  async setPostCategories(postId: string, authorId: string, categoryIds: string[]): Promise<void> {
    return this.repository.setPostCategories(postId, authorId, categoryIds);
  }

  async getPublishedPostTags(postId: string): Promise<PostTag[]> {
    return this.repository.getPublishedPostTags(postId);
  }

  async listTagsByAuthor(authorId: string): Promise<PostTag[]> {
    return this.repository.listTagsByAuthor(authorId);
  }

  async createTag(authorId: string, name: string, slug: string): Promise<PostTag> {
    return this.repository.createTag(authorId, name, slug);
  }

  async deleteTag(tagId: string, authorId: string): Promise<void> {
    return this.repository.deleteTag(tagId, authorId);
  }

  async getPostTags(postId: string): Promise<PostTag[]> {
    return this.repository.getPostTags(postId);
  }

  async setPostTags(postId: string, authorId: string, tagIds: string[]): Promise<void> {
    return this.repository.setPostTags(postId, authorId, tagIds);
  }
}
