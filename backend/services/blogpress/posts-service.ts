import type {
  IPostsRepository,
  PostAuthor,
  PublishedPostsResult,
} from '@/backend/repositories/blogpress/posts-repository';
import type { Post } from '@/shared/contracts/blogpress';
import type { PostInput } from '@/shared/contracts/blog';

export class BlogpressPostsService {
  constructor(private readonly repository: IPostsRepository) {}

  async getPublishedPosts(
    page: number,
    query: string,
    pageSize: number
  ): Promise<PublishedPostsResult> {
    return this.repository.getPublishedPosts(page, query, pageSize);
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

  async listPostsByAuthor(authorId: string): Promise<Post[]> {
    return this.repository.listPostsByAuthor(authorId);
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
    blogVisible: boolean
  ): Promise<{ slug: string }> {
    return this.repository.saveAndPublishPost(postId, authorId, data, blogVisible);
  }

  async publishPost(
    postId: string,
    authorId: string,
    blogVisible: boolean
  ): Promise<{ slug: string }> {
    return this.repository.publishPost(postId, authorId, blogVisible);
  }

  async unpublishPost(postId: string, authorId: string): Promise<{ slug: string }> {
    return this.repository.unpublishPost(postId, authorId);
  }

  async deletePost(postId: string, authorId: string): Promise<{ slug: string }> {
    return this.repository.deletePost(postId, authorId);
  }
}
