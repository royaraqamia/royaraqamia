import type {
  IPostsRepository,
  PostAuthor,
  PublishedPostsResult,
} from '@/backend/repositories/blogpress/posts-repository';
import type { Post, PostCategory } from '@/shared/contracts/blogpress';
import type { PostInput } from '@/shared/contracts/blog';
import { AdminValidator } from '@/shared/admin-validator';

export class BlogpressPostsService {
  constructor(
    private readonly repository: IPostsRepository,
    private readonly adminEmails: string[]
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
    const blogVisible = AdminValidator.isAdmin(authorEmail, this.adminEmails);
    return this.repository.saveAndPublishPost(postId, authorId, data, blogVisible);
  }

  async publishPost(
    postId: string,
    authorId: string,
    authorEmail: string
  ): Promise<{ slug: string }> {
    const blogVisible = AdminValidator.isAdmin(authorEmail, this.adminEmails);
    return this.repository.publishPost(postId, authorId, blogVisible);
  }

  async unpublishPost(postId: string, authorId: string): Promise<{ slug: string }> {
    return this.repository.unpublishPost(postId, authorId);
  }

  async deletePost(postId: string, authorId: string): Promise<{ slug: string }> {
    return this.repository.deletePost(postId, authorId);
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

  async setPostCategories(
    postId: string,
    authorId: string,
    categoryIds: string[]
  ): Promise<void> {
    return this.repository.setPostCategories(postId, authorId, categoryIds);
  }
}
