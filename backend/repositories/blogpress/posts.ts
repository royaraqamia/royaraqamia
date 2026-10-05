import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/backend/models/database.types';
import type {
  Post,
  PostSummary,
  PostCategory,
  PostTag,
  PostAuthor,
  PostAuthorSummary,
  PublishedPostsResult,
  PublishedFeedResult,
  RestorePostSnapshot,
} from '@/shared/contracts/blogpress';
import type { PostInput } from '@/shared/contracts/community';
import type { PostsRepository } from '@/backend/repositories/blogpress/posts-repository';
import { decodeFeedCursor, encodeFeedCursor, feedCursorFilter } from './feed-cursor';
import { estimateReadingTime } from '@/shared/reading-time';
import { sanitizeOrFilterTerm } from '@/backend/shared/postgrest-or-filter';
import { isNotFoundError, repositoryFailure } from '@/backend/shared/repository-error';

const PUBLISHED_POSTS_FILTER =
  'or(status.eq.published,and(status.eq.scheduled,publish_at.lte.now))';

/** Card projection used by the public feed and related posts — includes `content`. */
const POST_SUMMARY_COLUMNS =
  'id, author_id, title, slug, content, status, cover_image, meta_title, meta_desc, published_at, publish_at, view_count, featured, community_visible, reading_time_minutes, created_at, updated_at';

type Client = SupabaseClient<Database>;

export function createPostsRepository(supabase: Client): PostsRepository {
  async function resolveCategoryIdBySlug(slug: string): Promise<string | null> {
    const { data, error } = await supabase
      .from('community_categories')
      .select('id')
      .eq('slug', slug)
      .maybeSingle();

    if (error) throw repositoryFailure('blogpress.resolveCategoryIdBySlug', error);

    return data?.id ?? null;
  }

  async function postIdsForCategory(categoryId: string): Promise<string[]> {
    const { data, error } = await supabase
      .from('post_categories')
      .select('post_id')
      .eq('category_id', categoryId);

    if (error) throw repositoryFailure('blogpress.postIdsForCategory', error);

    return (data ?? []).map((row) => row.post_id);
  }

  function mapCategoryRows(
    rows: Array<{ community_categories: PostCategory | null }>
  ): PostCategory[] {
    const seen = new Set<string>();
    const categories: PostCategory[] = [];
    for (const row of rows) {
      const category = row.community_categories;
      if (category && !seen.has(category.id)) {
        seen.add(category.id);
        categories.push(category);
      }
    }
    return categories;
  }

  function mapTagRows(rows: Array<{ community_tags: PostTag | null }>): PostTag[] {
    const seen = new Set<string>();
    const tags: PostTag[] = [];
    for (const row of rows) {
      const tag = row.community_tags;
      if (tag && !seen.has(tag.id)) {
        seen.add(tag.id);
        tags.push(tag);
      }
    }
    return tags;
  }

  function buildTagMapByPost(
    rows: Array<{ post_id: string; community_tags: PostTag | null }>
  ): Record<string, PostTag[]> {
    const result: Record<string, PostTag[]> = {};
    for (const row of rows) {
      if (!row.community_tags) continue;
      (result[row.post_id] ??= []).push(row.community_tags);
    }
    return result;
  }

  return {
    async getPublishedPosts(
      page: number,
      query: string,
      pageSize: number,
      categorySlug?: string
    ): Promise<PublishedPostsResult> {
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      let postIds: string[] | null = null;
      if (categorySlug) {
        const categoryId = await resolveCategoryIdBySlug(categorySlug);
        if (!categoryId) {
          return { posts: [], totalPages: 0 };
        }
        postIds = await postIdsForCategory(categoryId);
      }

      let queryBuilder = supabase
        .from('posts')
        .select(POST_SUMMARY_COLUMNS, { count: 'exact' })
        .or(PUBLISHED_POSTS_FILTER)
        .eq('community_visible', true);

      if (postIds) {
        queryBuilder = queryBuilder.in('id', postIds);
      }

      const search = sanitizeOrFilterTerm(query);
      if (search) {
        queryBuilder = queryBuilder.or(`title.ilike.%${search}%,meta_desc.ilike.%${search}%`);
      }

      const {
        data: posts,
        count,
        error,
      } = await queryBuilder
        .order('published_at', { ascending: false, nullsFirst: true })
        .range(from, to);

      if (error) throw repositoryFailure('blogpress.getPublishedPosts', error);

      return {
        posts: (posts as PostSummary[]) ?? [],
        totalPages: Math.ceil((count ?? 0) / pageSize),
      };
    },

    async getPublishedFeed(
      cursor: string | null,
      query: string,
      pageSize: number,
      categorySlug?: string
    ): Promise<PublishedFeedResult> {
      const decoded = cursor ? decodeFeedCursor(cursor) : null;

      let postIds: string[] | null = null;
      if (categorySlug) {
        const categoryId = await resolveCategoryIdBySlug(categorySlug);
        if (!categoryId) {
          return { posts: [], nextCursor: null };
        }
        postIds = await postIdsForCategory(categoryId);
      }

      let queryBuilder = supabase
        .from('posts')
        .select(POST_SUMMARY_COLUMNS)
        .or(PUBLISHED_POSTS_FILTER)
        .eq('community_visible', true);

      if (postIds) {
        queryBuilder = queryBuilder.in('id', postIds);
      }

      const search = sanitizeOrFilterTerm(query);
      if (search) {
        queryBuilder = queryBuilder.or(`title.ilike.%${search}%,meta_desc.ilike.%${search}%`);
      }

      if (decoded) {
        queryBuilder = queryBuilder.or(feedCursorFilter(decoded));
      }

      // Fetch one extra row to know whether another page exists without a COUNT.
      const { data, error } = await queryBuilder
        .order('published_at', { ascending: false, nullsFirst: true })
        .order('id', { ascending: false })
        .limit(pageSize + 1);

      if (error) throw repositoryFailure('blogpress.getPublishedFeed', error);

      const rows = (data as PostSummary[]) ?? [];
      const hasMore = rows.length > pageSize;
      const posts = hasMore ? rows.slice(0, pageSize) : rows;
      const last = posts[posts.length - 1];

      return {
        posts,
        nextCursor:
          hasMore && last
            ? encodeFeedCursor({ publishedAt: last.published_at, id: last.id })
            : null,
      };
    },

    async getPublishedPostSlugs(): Promise<string[]> {
      const { data, error } = await supabase
        .from('posts')
        .select('slug')
        .or(PUBLISHED_POSTS_FILTER)
        .eq('community_visible', true);

      if (error) throw repositoryFailure('blogpress.getPublishedPostSlugs', error);

      return (data ?? []).map((row) => row.slug);
    },

    async getPublishedPostBySlug(slug: string): Promise<Post | null> {
      const { data, error } = await supabase
        .from('posts')
        .select('*')
        .eq('slug', slug)
        .or(PUBLISHED_POSTS_FILTER)
        .eq('community_visible', true)
        .single();

      if (error) {
        if (isNotFoundError(error)) return null;
        throw repositoryFailure('blogpress.getPublishedPostBySlug', error);
      }

      return data ? (data as Post) : null;
    },

    async getPostAuthor(authorId: string): Promise<PostAuthor | null> {
      const { data, error } = await supabase
        .from('users')
        .select('name, avatar_url, bio')
        .eq('id', authorId)
        .maybeSingle();

      if (error) throw repositoryFailure('blogpress.getPostAuthor', error);

      return data ?? null;
    },

    async getPostAuthors(authorIds: string[]): Promise<Record<string, PostAuthorSummary>> {
      if (authorIds.length === 0) return {};

      const { data, error } = await supabase
        .from('users')
        .select('id, name, avatar_url')
        .in('id', authorIds);

      if (error) throw repositoryFailure('blogpress.getPostAuthors', error);

      const authors: Record<string, PostAuthorSummary> = {};
      for (const row of data ?? []) {
        authors[row.id] = { name: row.name, avatar_url: row.avatar_url };
      }
      return authors;
    },

    async getPublishedCategories(): Promise<PostCategory[]> {
      const { data, error } = await supabase
        .from('post_categories')
        .select('community_categories(id, name, slug)');

      if (error) throw repositoryFailure('blogpress.getPublishedCategories', error);

      return mapCategoryRows(data ?? []);
    },

    async getPublishedPostCategories(postId: string): Promise<PostCategory[]> {
      const { data, error } = await supabase
        .from('post_categories')
        .select('community_categories(id, name, slug)')
        .eq('post_id', postId);

      if (error) throw repositoryFailure('blogpress.getPublishedPostCategories', error);

      return mapCategoryRows(data ?? []);
    },

    async incrementPostViewCount(postId: string): Promise<void> {
      const { error } = await supabase.rpc('increment_post_view_count', { p_post_id: postId });

      if (error) throw repositoryFailure('blogpress.incrementPostViewCount', error);
    },

    async listPostsByAuthor(authorId: string, categorySlug?: string): Promise<Post[]> {
      let queryBuilder = supabase.from('posts').select('*').eq('author_id', authorId);

      if (categorySlug) {
        const { data: category, error: categoryError } = await supabase
          .from('community_categories')
          .select('id')
          .eq('user_id', authorId)
          .eq('slug', categorySlug)
          .maybeSingle();
        if (categoryError) {
          throw repositoryFailure('blogpress.listPostsByAuthor.category', categoryError);
        }
        if (!category) {
          return [];
        }
        const postIds = await postIdsForCategory(category.id);
        if (postIds.length === 0) {
          return [];
        }
        queryBuilder = queryBuilder.in('id', postIds);
      }

      const { data, error } = await queryBuilder
        .order('featured', { ascending: false })
        .order('updated_at', { ascending: false });

      if (error) throw repositoryFailure('blogpress.listPostsByAuthor', error);

      return (data as Post[]) ?? [];
    },

    async getPostTitleById(id: string): Promise<string | null> {
      const { data, error } = await supabase.from('posts').select('title').eq('id', id).single();

      if (error) {
        if (isNotFoundError(error)) return null;
        throw repositoryFailure('blogpress.getPostTitleById', error);
      }

      return data?.title ?? null;
    },

    async getPostForUser(id: string, userId: string): Promise<Post | null> {
      const { data, error } = await supabase
        .from('posts')
        .select('*')
        .eq('id', id)
        .eq('author_id', userId)
        .single();

      if (error) {
        if (isNotFoundError(error)) return null;
        throw repositoryFailure('blogpress.getPostForUser', error);
      }

      return (data as Post) ?? null;
    },

    async createPost(authorId: string): Promise<{ id: string }> {
      const { data, error } = await supabase
        .from('posts')
        .insert({
          author_id: authorId,
          title: '',
          slug: `post-${crypto.randomUUID().slice(0, 8)}`,
        })
        .select('id')
        .single();

      if (error) throw new Error('فشل إنشاء المنشور');

      return { id: data.id };
    },

    async updatePost(postId: string, authorId: string, data: PostInput): Promise<void> {
      const { error } = await supabase
        .from('posts')
        .update({
          ...data,
          ...(data.content !== undefined
            ? { reading_time_minutes: estimateReadingTime(data.content) }
            : {}),
        })
        .eq('id', postId)
        .eq('author_id', authorId);

      if (error) {
        throw new Error(error.message);
      }
    },

    async saveAndPublishPost(
      postId: string,
      authorId: string,
      data: PostInput
    ): Promise<{ slug: string }> {
      const { data: updated, error } = await supabase
        .from('posts')
        .update({
          ...data,
          status: 'published',
          published_at: new Date().toISOString(),
          community_visible: true,
          ...(data.content !== undefined
            ? { reading_time_minutes: estimateReadingTime(data.content) }
            : {}),
        })
        .eq('id', postId)
        .eq('author_id', authorId)
        .select('slug')
        .single();

      if (error) throw new Error('فشل نشر المنشور');

      return { slug: updated.slug };
    },

    async publishPost(postId: string, authorId: string): Promise<{ slug: string }> {
      const { data, error } = await supabase
        .from('posts')
        .update({
          status: 'published',
          published_at: new Date().toISOString(),
          community_visible: true,
        })
        .eq('id', postId)
        .eq('author_id', authorId)
        .select('slug')
        .single();

      if (error) throw new Error('فشل نشر المنشور');

      return { slug: data.slug };
    },

    async unpublishPost(postId: string, authorId: string): Promise<{ slug: string }> {
      const { data, error } = await supabase
        .from('posts')
        .update({
          status: 'draft',
          published_at: null,
        })
        .eq('id', postId)
        .eq('author_id', authorId)
        .select('slug')
        .single();

      if (error) throw new Error('فشل إلغاء نشر المنشور');

      return { slug: data.slug };
    },

    async schedulePost(
      postId: string,
      authorId: string,
      publishAt: string
    ): Promise<{ slug: string }> {
      const { data, error } = await supabase
        .from('posts')
        .update({
          status: 'scheduled',
          publish_at: publishAt,
        })
        .eq('id', postId)
        .eq('author_id', authorId)
        .select('slug')
        .single();

      if (error) throw new Error('فشل جدولة المنشور');

      return { slug: data.slug };
    },

    async deletePost(postId: string, authorId: string): Promise<{ slug: string }> {
      const { data, error } = await supabase
        .from('posts')
        .delete()
        .eq('id', postId)
        .eq('author_id', authorId)
        .select('slug')
        .single();

      if (error) throw new Error('فشل حذف المنشور');

      return { slug: data.slug };
    },

    async restorePost(authorId: string, snapshot: RestorePostSnapshot): Promise<{ id: string }> {
      const { data, error } = await supabase
        .from('posts')
        .insert({
          author_id: authorId,
          title: snapshot.title,
          slug: snapshot.slug,
          content: snapshot.content,
          status: snapshot.status,
          cover_image: snapshot.cover_image,
          meta_title: snapshot.meta_title,
          meta_desc: snapshot.meta_desc,
          published_at: snapshot.published_at,
          publish_at: snapshot.publish_at,
          view_count: snapshot.view_count,
          featured: snapshot.featured,
          community_visible: snapshot.community_visible,
          reading_time_minutes: snapshot.reading_time_minutes,
        })
        .select('id')
        .single();

      if (error) throw new Error('فشل استرجاع المنشور');

      return { id: data.id };
    },

    async setPostFeatured(postId: string, authorId: string, featured: boolean): Promise<void> {
      const { error } = await supabase
        .from('posts')
        .update({ featured })
        .eq('id', postId)
        .eq('author_id', authorId);

      if (error) throw new Error('فشل تحديث تثبيت المنشور');
    },

    async listCategoriesByAuthor(authorId: string): Promise<PostCategory[]> {
      const { data, error } = await supabase
        .from('community_categories')
        .select('id, name, slug')
        .eq('user_id', authorId)
        .order('created_at', { ascending: true });

      if (error) throw repositoryFailure('blogpress.listCategoriesByAuthor', error);

      return (data as PostCategory[]) ?? [];
    },

    async createCategory(authorId: string, name: string, slug: string): Promise<PostCategory> {
      const { data, error } = await supabase
        .from('community_categories')
        .insert({ user_id: authorId, name, slug })
        .select('id, name, slug')
        .single();

      if (error) throw new Error('فشل إنشاء التصنيف');

      return data as PostCategory;
    },

    async deleteCategory(categoryId: string, authorId: string): Promise<void> {
      const { error } = await supabase
        .from('community_categories')
        .delete()
        .eq('id', categoryId)
        .eq('user_id', authorId);

      if (error) throw new Error('فشل حذف التصنيف');
    },

    async getPostCategories(postId: string): Promise<PostCategory[]> {
      const { data, error } = await supabase
        .from('post_categories')
        .select('community_categories(id, name, slug)')
        .eq('post_id', postId);

      if (error) throw repositoryFailure('blogpress.getPostCategories', error);

      return mapCategoryRows(data ?? []);
    },

    async setPostCategories(
      postId: string,
      _authorId: string,
      categoryIds: string[]
    ): Promise<void> {
      await supabase.from('post_categories').delete().eq('post_id', postId);

      if (categoryIds.length === 0) return;

      const rows = categoryIds.map((category_id) => ({ post_id: postId, category_id }));
      const { error } = await supabase.from('post_categories').insert(rows);
      if (error) throw new Error('فشل تحديث تصنيفات المنشور');
    },

    async getPublishedPostTags(postId: string): Promise<PostTag[]> {
      const { data, error } = await supabase
        .from('post_tags')
        .select('community_tags(id, name, slug)')
        .eq('post_id', postId);

      if (error) throw repositoryFailure('blogpress.getPublishedPostTags', error);

      return mapTagRows(data ?? []);
    },

    async listTagsByAuthor(authorId: string): Promise<PostTag[]> {
      const { data, error } = await supabase
        .from('community_tags')
        .select('id, name, slug')
        .eq('user_id', authorId)
        .order('created_at', { ascending: true });

      if (error) throw repositoryFailure('blogpress.listTagsByAuthor', error);

      return (data as PostTag[]) ?? [];
    },

    async createTag(authorId: string, name: string, slug: string): Promise<PostTag> {
      const { data, error } = await supabase
        .from('community_tags')
        .insert({ user_id: authorId, name, slug })
        .select('id, name, slug')
        .single();

      if (error) throw new Error('فشل إنشاء الوسم');

      return data as PostTag;
    },

    async deleteTag(tagId: string, authorId: string): Promise<void> {
      const { error } = await supabase
        .from('community_tags')
        .delete()
        .eq('id', tagId)
        .eq('user_id', authorId);

      if (error) throw new Error('فشل حذف الوسم');
    },

    async getPostTags(postId: string): Promise<PostTag[]> {
      const { data, error } = await supabase
        .from('post_tags')
        .select('community_tags(id, name, slug)')
        .eq('post_id', postId);

      if (error) throw repositoryFailure('blogpress.getPostTags', error);

      return mapTagRows(data ?? []);
    },

    async getPostTagsByPostIds(postIds: string[]): Promise<Record<string, PostTag[]>> {
      if (postIds.length === 0) return {};
      const { data, error } = await supabase
        .from('post_tags')
        .select('post_id, community_tags(id, name, slug)')
        .in('post_id', postIds);

      if (error) throw repositoryFailure('blogpress.getPostTagsByPostIds', error);

      return buildTagMapByPost(data ?? []);
    },

    async setPostTags(postId: string, _authorId: string, tagIds: string[]): Promise<void> {
      await supabase.from('post_tags').delete().eq('post_id', postId);

      if (tagIds.length === 0) return;

      const rows = tagIds.map((tag_id) => ({ post_id: postId, tag_id }));
      const { error } = await supabase.from('post_tags').insert(rows);
      if (error) throw new Error('فشل تحديث وسوم المنشور');
    },

    async bulkActionPosts(
      postIds: string[],
      authorId: string,
      action: 'publish' | 'unpublish' | 'delete'
    ): Promise<{ affected: number; slugs: string[] }> {
      if (action === 'delete') {
        const { data: deleted, error } = await supabase
          .from('posts')
          .delete()
          .in('id', postIds)
          .eq('author_id', authorId)
          .select('slug');
        if (error) throw new Error('فشل حذف المنشورات');
        return { affected: deleted.length, slugs: deleted.map((row) => row.slug) };
      }

      const update = (
        action === 'publish'
          ? {
              status: 'published' as const,
              published_at: new Date().toISOString(),
              community_visible: true,
            }
          : { status: 'draft' as const, published_at: null }
      ) satisfies Partial<Database['public']['Tables']['posts']['Row']> & {
        published_at: string | null;
      };

      const { data: updated, error } = await supabase
        .from('posts')
        .update(update)
        .in('id', postIds)
        .eq('author_id', authorId)
        .select('slug');

      if (error) throw new Error('فشل تحديث حالة المنشورات');

      return { affected: updated.length, slugs: updated.map((row) => row.slug) };
    },

    async bulkSetPostCategories(
      postIds: string[],
      authorId: string,
      categoryId: string
    ): Promise<void> {
      const { data: owned, error: ownedError } = await supabase
        .from('posts')
        .select('id')
        .in('id', postIds)
        .eq('author_id', authorId);

      if (ownedError) throw repositoryFailure('blogpress.bulkSetPostCategories.owned', ownedError);

      const ownedIds = (owned ?? []).map((row) => row.id);
      if (ownedIds.length === 0) return;

      await supabase.from('post_categories').delete().in('post_id', ownedIds);

      const rows = ownedIds.map((post_id) => ({ post_id, category_id: categoryId }));
      const { error } = await supabase.from('post_categories').insert(rows);
      if (error) throw new Error('فشل تحديث تصنيف المنشورات');
    },
  };
}
