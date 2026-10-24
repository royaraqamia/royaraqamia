import type {
  Post,
  PostCategory,
  PostTag,
  PostAuthor,
  PostAuthorSummary,
  PublishedPostsResult,
  PublishedFeedResult,
  RestorePostSnapshot,
  PostSitemapEntry,
} from '@/shared/contracts/blogpress';
import type { PostInput } from '@/shared/contracts/community';

export interface PostsRepository {
  getPublishedPosts(
    page: number,
    query: string,
    pageSize: number,
    categorySlug?: string
  ): Promise<PublishedPostsResult>;
  getPublishedFeed(
    cursor: string | null,
    query: string,
    pageSize: number,
    categorySlug?: string,
    authorId?: string
  ): Promise<PublishedFeedResult>;
  getPublishedPostSlugs(): Promise<string[]>;
  getPublishedPostSitemapEntries(): Promise<PostSitemapEntry[]>;
  getPublishedPostBySlug(slug: string): Promise<Post | null>;
  getPostAuthor(authorId: string): Promise<PostAuthor | null>;
  getPostAuthors(authorIds: string[]): Promise<Record<string, PostAuthorSummary>>;
  getPublishedCategories(): Promise<PostCategory[]>;
  getPublishedPostCategories(postId: string): Promise<PostCategory[]>;
  incrementPostViewCount(postId: string): Promise<void>;
  listPostsByAuthor(authorId: string, categorySlug?: string): Promise<Post[]>;
  /**
   * The whole owned snapshot for the client pull (ADR-0060), deliberately
   * unfiltered by `deleted_at`: a tombstone is part of the snapshot so a delete
   * made on another device can land here. Untagged, unsorted beyond
   * `updated_at` — the store is LWW per row and never renders a page from this.
   */
  listPostsByAuthorIncludingDeleted(authorId: string): Promise<Post[]>;
  getPostExcerptById(id: string): Promise<string | null>;
  getPostForUser(id: string, userId: string): Promise<Post | null>;
  createPost(authorId: string, input?: PostInput): Promise<{ id: string }>;
  createAndPublishPost(authorId: string, input: PostInput): Promise<{ id: string; slug: string }>;
  updatePost(postId: string, authorId: string, data: PostInput): Promise<void>;
  saveAndPublishPost(postId: string, authorId: string, data: PostInput): Promise<{ slug: string }>;
  publishPost(postId: string, authorId: string): Promise<{ slug: string }>;
  unpublishPost(postId: string, authorId: string): Promise<{ slug: string }>;
  schedulePost(postId: string, authorId: string, publishAt: string): Promise<{ slug: string }>;
  deletePost(
    postId: string,
    authorId: string,
    updatedAt?: string
  ): Promise<{ slug: string | null }>;
  restorePost(authorId: string, snapshot: RestorePostSnapshot): Promise<{ id: string }>;
  setPostFeatured(postId: string, authorId: string, featured: boolean): Promise<void>;
  bulkActionPosts(
    postIds: string[],
    authorId: string,
    action: 'publish' | 'unpublish' | 'delete'
  ): Promise<{ affected: number; slugs: string[] }>;
  /**
   * Splits a bulk-publish selection into the owned posts that still have to
   * transition and the owned posts that are already published. Ids the caller
   * does not own, and tombstones, appear in neither list.
   */
  resolveBulkPublishTargets(
    postIds: string[],
    authorId: string
  ): Promise<{ transitionIds: string[]; alreadyPublishedIds: string[] }>;
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
