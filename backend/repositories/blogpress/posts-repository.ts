import type { Post, PostCategory } from '@/shared/contracts/blogpress';
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

export interface PostsRepository {
  getPublishedPosts(
    page: number,
    query: string,
    pageSize: number,
    categorySlug?: string
  ): Promise<PublishedPostsResult>;
  getPublishedPostBySlug(slug: string): Promise<Post | null>;
  getPostAuthor(authorId: string): Promise<PostAuthor | null>;
  getRelatedPosts(slug: string): Promise<Post[]>;
  getPublishedCategories(): Promise<PostCategory[]>;
  getPublishedPostCategories(postId: string): Promise<PostCategory[]>;
  incrementPostViewCount(postId: string): Promise<void>;
  listPostsByAuthor(authorId: string, categorySlug?: string): Promise<Post[]>;
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
  setPostFeatured(postId: string, authorId: string, featured: boolean): Promise<void>;
  listCategoriesByAuthor(authorId: string): Promise<PostCategory[]>;
  createCategory(authorId: string, name: string, slug: string): Promise<PostCategory>;
  deleteCategory(categoryId: string, authorId: string): Promise<void>;
  getPostCategories(postId: string): Promise<PostCategory[]>;
  setPostCategories(postId: string, authorId: string, categoryIds: string[]): Promise<void>;
}
