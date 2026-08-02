import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/backend/models/database.types';
import type { Post } from '@/shared/contracts/blogpress';
import type { PostInput } from '@/shared/contracts/blog';
import type {
  IPostsRepository,
  PostAuthor,
  PublishedPostsResult,
} from '@/backend/repositories/blogpress/posts-repository';

export function createPostsRepository(supabase: SupabaseClient<Database>): IPostsRepository {
  return {
    async getPublishedPosts(
      page: number,
      query: string,
      pageSize: number
    ): Promise<PublishedPostsResult> {
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      let queryBuilder = supabase
        .from('posts')
        .select('*', { count: 'exact' })
        .eq('status', 'published')
        .eq('blog_visible', true);

      if (query) {
        queryBuilder = queryBuilder.or(`title.ilike.%${query}%,meta_desc.ilike.%${query}%`);
      }

      const { data: posts, count } = await queryBuilder
        .order('published_at', { ascending: false })
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
        .eq('status', 'published')
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
        .eq('status', 'published')
        .eq('blog_visible', true)
        .neq('slug', slug)
        .order('published_at', { ascending: false })
        .limit(3);
      return (data as Post[]) ?? [];
    },

    async listPostsByAuthor(authorId: string): Promise<Post[]> {
      const { data } = await supabase
        .from('posts')
        .select('*')
        .eq('author_id', authorId)
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
  };
}
