import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/backend/models/database.types';
import type {
  Post,
  PostCategory,
  PostTag,
  PostAuthor,
  PublishedPostsResult,
} from '@/shared/contracts/blogpress';
import type { PostInput } from '@/shared/contracts/blog';
import type { PostsRepository } from '@/backend/repositories/blogpress/posts-repository';

const PUBLISHED_POSTS_FILTER =
  'or(status.eq.published,and(status.eq.scheduled,publish_at.lte.now))';

type Client = SupabaseClient<Database>;

export function createPostsRepository(supabase: Client): PostsRepository {
  async function resolveCategoryIdBySlug(slug: string): Promise<string | null> {
    const { data } = await supabase
      .from('blog_categories')
      .select('id')
      .eq('slug', slug)
      .maybeSingle();
    return data?.id ?? null;
  }

  async function postIdsForCategory(categoryId: string): Promise<string[]> {
    const { data } = await supabase
      .from('post_categories')
      .select('post_id')
      .eq('category_id', categoryId);
    return (data ?? []).map((row) => row.post_id);
  }

  function mapCategoryRows(rows: Array<{ blog_categories: PostCategory | null }>): PostCategory[] {
    const seen = new Set<string>();
    const categories: PostCategory[] = [];
    for (const row of rows) {
      const category = row.blog_categories;
      if (category && !seen.has(category.id)) {
        seen.add(category.id);
        categories.push(category);
      }
    }
    return categories;
  }

  function mapTagRows(rows: Array<{ blog_tags: PostTag | null }>): PostTag[] {
    const seen = new Set<string>();
    const tags: PostTag[] = [];
    for (const row of rows) {
      const tag = row.blog_tags;
      if (tag && !seen.has(tag.id)) {
        seen.add(tag.id);
        tags.push(tag);
      }
    }
    return tags;
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
        .select('*', { count: 'exact' })
        .or(PUBLISHED_POSTS_FILTER)
        .eq('blog_visible', true);

      if (postIds) {
        queryBuilder = queryBuilder.in('id', postIds);
      }

      if (query) {
        queryBuilder = queryBuilder.or(`title.ilike.%${query}%,meta_desc.ilike.%${query}%`);
      }

      const { data: posts, count } = await queryBuilder
        .order('published_at', { ascending: false, nullsFirst: true })
        .range(from, to);

      return {
        posts: (posts as Post[]) ?? [],
        totalPages: Math.ceil((count ?? 0) / pageSize),
      };
    },

    async getPublishedPostBySlug(slug: string): Promise<Post | null> {
      const { data } = await supabase
        .from('posts')
        .select('*')
        .eq('slug', slug)
        .or(PUBLISHED_POSTS_FILTER)
        .eq('blog_visible', true)
        .single();
      return (data as Post) ?? null;
    },

    async getPostAuthor(authorId: string): Promise<PostAuthor | null> {
      const { data } = await supabase
        .from('users')
        .select('name, avatar_url, bio')
        .eq('id', authorId)
        .maybeSingle();
      return data ?? null;
    },

    async getRelatedPosts(slug: string): Promise<Post[]> {
      const { data } = await supabase
        .from('posts')
        .select('id, title, slug, cover_image, published_at, content')
        .or(PUBLISHED_POSTS_FILTER)
        .eq('blog_visible', true)
        .neq('slug', slug)
        .order('published_at', { ascending: false, nullsFirst: true })
        .limit(3);
      return (data as Post[]) ?? [];
    },

    async getPublishedCategories(): Promise<PostCategory[]> {
      const { data } = await supabase
        .from('post_categories')
        .select('blog_categories(id, name, slug)');
      return mapCategoryRows(data ?? []);
    },

    async getPublishedPostCategories(postId: string): Promise<PostCategory[]> {
      const { data } = await supabase
        .from('post_categories')
        .select('blog_categories(id, name, slug)')
        .eq('post_id', postId);
      return mapCategoryRows(data ?? []);
    },

    async incrementPostViewCount(postId: string): Promise<void> {
      await supabase.rpc('increment_post_view_count', { p_post_id: postId });
    },

    async listPostsByAuthor(authorId: string, categorySlug?: string): Promise<Post[]> {
      let queryBuilder = supabase.from('posts').select('*').eq('author_id', authorId);

      if (categorySlug) {
        const { data: category } = await supabase
          .from('blog_categories')
          .select('id')
          .eq('user_id', authorId)
          .eq('slug', categorySlug)
          .maybeSingle();
        if (!category) {
          return [];
        }
        const postIds = await postIdsForCategory(category.id);
        if (postIds.length === 0) {
          return [];
        }
        queryBuilder = queryBuilder.in('id', postIds);
      }

      const { data } = await queryBuilder
        .order('featured', { ascending: false })
        .order('updated_at', { ascending: false });
      return (data as Post[]) ?? [];
    },

    async getPostTitleById(id: string): Promise<string | null> {
      const { data } = await supabase.from('posts').select('title').eq('id', id).single();
      return data?.title ?? null;
    },

    async getPostForUser(id: string, userId: string): Promise<Post | null> {
      const { data, error } = await supabase
        .from('posts')
        .select('*')
        .eq('id', id)
        .eq('author_id', userId)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw new Error(`Failed to fetch post: ${error.message}`);
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

      if (error) throw new Error('فشل إنشاء المقال');

      return { id: data.id };
    },

    async updatePost(postId: string, authorId: string, data: PostInput): Promise<void> {
      const { error } = await supabase
        .from('posts')
        .update(data)
        .eq('id', postId)
        .eq('author_id', authorId);

      if (error) {
        throw new Error(error.message);
      }
    },

    async saveAndPublishPost(
      postId: string,
      authorId: string,
      data: PostInput,
      blogVisible: boolean
    ): Promise<{ slug: string }> {
      const { data: updated, error } = await supabase
        .from('posts')
        .update({
          ...data,
          status: 'published',
          published_at: new Date().toISOString(),
          blog_visible: blogVisible,
        })
        .eq('id', postId)
        .eq('author_id', authorId)
        .select('slug')
        .single();

      if (error) throw new Error('فشل نشر المقال');

      return { slug: updated.slug };
    },

    async publishPost(
      postId: string,
      authorId: string,
      blogVisible: boolean
    ): Promise<{ slug: string }> {
      const { data, error } = await supabase
        .from('posts')
        .update({
          status: 'published',
          published_at: new Date().toISOString(),
          blog_visible: blogVisible,
        })
        .eq('id', postId)
        .eq('author_id', authorId)
        .select('slug')
        .single();

      if (error) throw new Error('فشل نشر المقال');

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

      if (error) throw new Error('فشل إلغاء نشر المقال');

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

      if (error) throw new Error('فشل جدولة المقال');

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

      if (error) throw new Error('فشل حذف المقال');

      return { slug: data.slug };
    },

    async setPostFeatured(postId: string, authorId: string, featured: boolean): Promise<void> {
      const { error } = await supabase
        .from('posts')
        .update({ featured })
        .eq('id', postId)
        .eq('author_id', authorId);

      if (error) throw new Error('فشل تحديث تثبيت المقال');
    },

    async listCategoriesByAuthor(authorId: string): Promise<PostCategory[]> {
      const { data } = await supabase
        .from('blog_categories')
        .select('id, name, slug')
        .eq('user_id', authorId)
        .order('created_at', { ascending: true });
      return (data as PostCategory[]) ?? [];
    },

    async createCategory(authorId: string, name: string, slug: string): Promise<PostCategory> {
      const { data, error } = await supabase
        .from('blog_categories')
        .insert({ user_id: authorId, name, slug })
        .select('id, name, slug')
        .single();

      if (error) throw new Error('فشل إنشاء التصنيف');

      return data as PostCategory;
    },

    async deleteCategory(categoryId: string, authorId: string): Promise<void> {
      const { error } = await supabase
        .from('blog_categories')
        .delete()
        .eq('id', categoryId)
        .eq('user_id', authorId);

      if (error) throw new Error('فشل حذف التصنيف');
    },

    async getPostCategories(postId: string): Promise<PostCategory[]> {
      const { data } = await supabase
        .from('post_categories')
        .select('blog_categories(id, name, slug)')
        .eq('post_id', postId);
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
      if (error) throw new Error('فشل تحديث تصنيفات المقال');
    },

    async getPublishedPostTags(postId: string): Promise<PostTag[]> {
      const { data } = await supabase
        .from('post_tags')
        .select('blog_tags(id, name, slug)')
        .eq('post_id', postId);
      return mapTagRows(data ?? []);
    },

    async listTagsByAuthor(authorId: string): Promise<PostTag[]> {
      const { data } = await supabase
        .from('blog_tags')
        .select('id, name, slug')
        .eq('user_id', authorId)
        .order('created_at', { ascending: true });
      return (data as PostTag[]) ?? [];
    },

    async createTag(authorId: string, name: string, slug: string): Promise<PostTag> {
      const { data, error } = await supabase
        .from('blog_tags')
        .insert({ user_id: authorId, name, slug })
        .select('id, name, slug')
        .single();

      if (error) throw new Error('فشل إنشاء الوسم');

      return data as PostTag;
    },

    async deleteTag(tagId: string, authorId: string): Promise<void> {
      const { error } = await supabase
        .from('blog_tags')
        .delete()
        .eq('id', tagId)
        .eq('user_id', authorId);

      if (error) throw new Error('فشل حذف الوسم');
    },

    async getPostTags(postId: string): Promise<PostTag[]> {
      const { data } = await supabase
        .from('post_tags')
        .select('blog_tags(id, name, slug)')
        .eq('post_id', postId);
      return mapTagRows(data ?? []);
    },

    async setPostTags(postId: string, _authorId: string, tagIds: string[]): Promise<void> {
      await supabase.from('post_tags').delete().eq('post_id', postId);

      if (tagIds.length === 0) return;

      const rows = tagIds.map((tag_id) => ({ post_id: postId, tag_id }));
      const { error } = await supabase.from('post_tags').insert(rows);
      if (error) throw new Error('فشل تحديث وسوم المقال');
    },

    async bulkActionPosts(
      postIds: string[],
      authorId: string,
      action: 'publish' | 'unpublish' | 'delete',
      blogVisible?: boolean
    ): Promise<{ affected: number; slugs: string[] }> {
      if (action === 'delete') {
        const { data: deleted, error } = await supabase
          .from('posts')
          .delete()
          .in('id', postIds)
          .eq('author_id', authorId)
          .select('slug');
        if (error) throw new Error('فشل حذف المقالات');
        return { affected: deleted.length, slugs: deleted.map((row) => row.slug) };
      }

      const update = (
        action === 'publish'
          ? {
              status: 'published' as const,
              published_at: new Date().toISOString(),
              blog_visible: blogVisible ?? false,
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

      if (error) throw new Error('فشل تحديث حالة المقالات');

      return { affected: updated.length, slugs: updated.map((row) => row.slug) };
    },

    async bulkSetPostCategories(
      postIds: string[],
      authorId: string,
      categoryId: string
    ): Promise<void> {
      const { data: owned } = await supabase
        .from('posts')
        .select('id')
        .in('id', postIds)
        .eq('author_id', authorId);
      const ownedIds = (owned ?? []).map((row) => row.id);
      if (ownedIds.length === 0) return;

      await supabase.from('post_categories').delete().in('post_id', ownedIds);

      const rows = ownedIds.map((post_id) => ({ post_id, category_id: categoryId }));
      const { error } = await supabase.from('post_categories').insert(rows);
      if (error) throw new Error('فشل تحديث تصنيف المقالات');
    },
  };
}
