import type {
  Post,
  PostSummary,
  PostCategory,
  PostTag,
  PostAuthor,
  PublishedPostsResult,
} from '@/shared/contracts/blogpress';
import type { PostInput } from '@/shared/contracts/blog';

export interface PostsRepository {
  getPublishedPosts(
    page: number,
    query: string,
    pageSize: number,
    categorySlug?: string
  ): Promise<PublishedPostsResult>;
  getPublishedPostSlugs(): Promise<string[]>;
  getPublishedPostBySlug(slug: string): Promise<Post | null>;
  getPostAuthor(authorId: string): Promise<PostAuthor | null>;
  getRelatedPosts(slug: string): Promise<PostSummary[]>;
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
  schedulePost(postId: string, authorId: string, publishAt: string): Promise<{ slug: string }>;
  deletePost(postId: string, authorId: string): Promise<{ slug: string }>;
  setPostFeatured(postId: string, authorId: string, featured: boolean): Promise<void>;
  bulkActionPosts(
    postIds: string[],
    authorId: string,
    action: 'publish' | 'unpublish' | 'delete',
    blogVisible?: boolean
  ): Promise<{ affected: number; slugs: string[] }>;
  bulkSetPostCategories(postIds: string[], authorId: string, categoryId: string): Promise<void>;
  listCategoriesByAuthor(authorId: string): Promise<PostCategory[]>;
  createCategory(authorId: string, name: string, slug: string): Promise<PostCategory>;
  deleteCategory(categoryId: string, authorId: string): Promise<void>;
  getPostCategories(postId: string): Promise<PostCategory[]>;
  setPostCategories(postId: string, authorId: string, categoryIds: string[]): Promise<void>;
  getPublishedPostTags(postId: string): Promise<PostTag[]>;
  listTagsByAuthor(authorId: string): Promise<PostTag[]>;
  createTag(authorId: string, name: string, slug: string): Promise<PostTag>;
  deleteTag(tagId: string, authorId: string): Promise<void>;
  getPostTags(postId: string): Promise<PostTag[]>;
  getPostTagsByPostIds(postIds: string[]): Promise<Record<string, PostTag[]>>;
  setPostTags(postId: string, authorId: string, tagIds: string[]): Promise<void>;
}
