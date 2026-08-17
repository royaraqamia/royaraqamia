export type PostStatus = 'draft' | 'published' | 'scheduled';

export interface Post {
  id: string;
  author_id: string;
  title: string;
  slug: string;
  content: string | null;
  status: PostStatus;
  cover_image: string | null;
  meta_title: string | null;
  meta_desc: string | null;
  published_at: string | null;
  publish_at: string | null;
  view_count: number;
  featured: boolean;
  blog_visible: boolean;
  reading_time_minutes: number;
  created_at: string;
  updated_at: string;
}

/** Feed-card projection: same shape as `Post` minus the heavy `content` column. */
export type PostSummary = Omit<Post, 'content'>;

export interface PostCategory {
  id: string;
  name: string;
  slug: string;
}

export interface PostTag {
  id: string;
  name: string;
  slug: string;
}

export interface PostAuthor {
  name: string | null;
  avatar_url: string | null;
  bio: string | null;
}

export interface PublishedPostsResult {
  posts: PostSummary[];
  totalPages: number;
}
