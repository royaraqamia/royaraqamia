import type { Post } from '@/shared/contracts/blogpress';
import type { PostInput } from '@/shared/contracts/blog';

export interface PostAuthor {
  name: string | null;
  avatar_url: string | null;
  bio: string | null;
}

export interface PublishedPostsResult {
  posts: Post[];
  totalPages: number;
}

export interface IPostsRepository {
  getPublishedPosts(page: number, query: string, pageSize: number): Promise<PublishedPostsResult>;
  getPublishedPostBySlug(slug: string): Promise<Post | null>;
  getPostAuthor(authorId: string): Promise<PostAuthor | null>;
  getRelatedPosts(slug: string): Promise<Post[]>;
  listPostsByAuthor(authorId: string): Promise<Post[]>;
  getPostTitleById(id: string): Promise<string | null>;
  getPostForUser(id: string, userId: string): Promise<Post | null>;
  createPost(authorId: string): Promise<{ id: string }>;
  updatePost(postId: string, authorId: string, data: PostInput): Promise<void>;
  saveAndPublishPost(
    postId: string,
    authorId: string,
    data: PostInput,
    blogVisible: boolean
  ): Promise<{ slug: string }>;
  publishPost(postId: string, authorId: string, blogVisible: boolean): Promise<{ slug: string }>;
  unpublishPost(postId: string, authorId: string): Promise<{ slug: string }>;
  deletePost(postId: string, authorId: string): Promise<{ slug: string }>;
}
