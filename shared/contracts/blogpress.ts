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
  created_at: string;
  updated_at: string;
}

export interface PostCategory {
  id: string;
  name: string;
  slug: string;
}
