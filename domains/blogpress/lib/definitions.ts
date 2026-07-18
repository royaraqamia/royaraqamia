export type PostStatus = 'draft' | 'published';

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
  created_at: string;
  updated_at: string;
}

export interface UserProfile {
  id: string;
  email: string;
  name: string | null;
  avatar_url: string | null;
  bio: string | null;
}

export type ActionState = { errors?: Record<string, string[]>; message?: string } | undefined;
