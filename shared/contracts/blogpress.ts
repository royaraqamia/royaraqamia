import { z } from 'zod';

export type PostStatus = 'draft' | 'published' | 'scheduled';

export interface Post {
  id: string;
  author_id: string;
  /** Client-minted identity for the offline write contract (ADR-0029). */
  client_id?: string | null;
  /** Tombstone marker; a deleted draft stays as a row and reads filter it out. */
  deleted_at?: string | null;
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
  community_visible: boolean;
  reading_time_minutes: number;
  created_at: string;
  updated_at: string;
}

/** Public publisher identity shown on feed cards — no private columns (e.g. email). */
export interface PostAuthorSummary {
  username: string;
  name: string | null;
  avatar_url: string | null;
}

/** Feed-card projection: the post body plus its public publisher. */
export type PostSummary = Post & {
  author?: PostAuthorSummary | null;
};

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
  username: string;
  name: string | null;
  avatar_url: string | null;
  bio: string | null;
}

/**
 * The full owned snapshot the client pull reconciles with (ADR-0060),
 * tombstone-inclusive: a delete made on another device is a `deleted_at` row,
 * so a snapshot that filtered it would resurrect the draft here.
 */
export interface BlogpressSyncSnapshot {
  posts: Post[];
}

/**
 * The content half of a deleted post, re-sent by the client to undo a delete.
 *
 * Only editor-owned fields are accepted: `status`, the publication dates,
 * `view_count`, `featured`, `community_visible` and `reading_time_minutes` stay
 * on the tombstoned row the server revives, never on the request (#528). `id`
 * is an optional lookup hint; the server also finds the tombstone by slug, and
 * refuses both when the row is not the caller's.
 */
export const RestorePostSnapshotSchema = z.object({
  id: z.string().uuid('معرِّف منشور غير صالح').optional(),
  slug: z.string().min(1, 'الرَّابط مطلوب'),
  content: z.string().nullable(),
  cover_image: z.string().nullable(),
  meta_title: z.string().nullable(),
  meta_desc: z.string().nullable(),
  tagIds: z.array(z.string().uuid('معرِّف وسم غير صالح')).max(10, 'الحد الأقصى 10 وسوم').optional(),
});

export type RestorePostSnapshot = z.infer<typeof RestorePostSnapshotSchema>;

export interface PublishedPostsResult {
  posts: PostSummary[];
  totalPages: number;
}

/** Keyset (cursor) page of the public feed: `nextCursor` is null on the last page. */
export interface PublishedFeedResult {
  posts: PostSummary[];
  nextCursor: string | null;
}

/** Lightweight projection used to build the XML sitemap, one entry per published post. */
export interface PostSitemapEntry {
  slug: string;
  updated_at: string | null;
}
