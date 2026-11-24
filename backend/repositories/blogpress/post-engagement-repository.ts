import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/backend/models/database.types';
import { guardRepositoryMethods, isNotFoundError } from '@/backend/shared/repository-error';

/** The two numbers a post's controls print. */
export interface PostEngagementCounts {
  likes: number;
  comments: number;
}

/** One stored comment, before its author is joined onto it. */
export interface PostCommentRow {
  id: string;
  postId: string;
  authorId: string;
  body: string;
  createdAt: string;
  editedAt: string | null;
}

/** The identity a comment draws: the same four columns a card's publisher has. */
export interface PostCommentAuthorRow {
  id: string;
  username: string;
  name: string | null;
  avatarUrl: string | null;
}

export interface PostCommentPage {
  rows: PostCommentRow[];
  /** Opaque keyset cursor of the last row, or null on the last page. */
  nextCursor: string | null;
  /** Live comments on the post, for the action bar's number. */
  total: number;
}

/**
 * Likes and comments, as rows.
 *
 * The tables grant `select` only and the write functions are service-role only,
 * so this repository is the only code that writes either fact — and it does so
 * through the functions, never with an `insert`, because the function is what
 * answers the count the button settles on.
 *
 * Reads are batched on purpose: a page of cards asks `counts` once and
 * `likedAmong` once, never a query per card.
 */
export interface PostEngagementRepository {
  /** The live post a slug names, or null when it is not public. */
  findPostIdBySlug(slug: string): Promise<string | null>;
  counts(postIds: string[]): Promise<Record<string, PostEngagementCounts>>;
  /** Which of `postIds` this member already liked, in one read. */
  likedAmong(userId: string, postIds: string[]): Promise<string[]>;
  /** Set the state wanted, never a toggle: a retried press cannot flip it back. */
  setLike(
    postId: string,
    userId: string,
    liked: boolean
  ): Promise<{ liked: boolean; likeCount: number }>;
  /**
   * One keyset page of live comments, newest first, with the post's public total.
   * A viewer filters out authors on either side of a block before the page is
   * cut; a null viewer is a guest and sees the unfiltered thread.
   */
  listComments(
    postId: string,
    cursor: string | null,
    pageSize: number,
    viewerId?: string | null
  ): Promise<PostCommentPage>;
  /** The author of a post, for the host-removal check. */
  postAuthor(postId: string): Promise<string | null>;
  /** The public identity of every author named by `ids`, in one read. */
  authorsByIds(ids: string[]): Promise<Record<string, PostCommentAuthorRow>>;
  /** The write gate the database also enforces: ok, unverified or blocked. */
  commentWriteGate(postId: string, authorId: string): Promise<'ok' | 'unverified' | 'blocked'>;
  getComment(commentId: string): Promise<PostCommentRow | null>;
  createComment(
    postId: string,
    authorId: string,
    body: string
  ): Promise<{ id: string; createdAt: string; commentCount: number } | null>;
  updateComment(
    commentId: string,
    authorId: string,
    body: string
  ): Promise<{ id: string; body: string; editedAt: string | null } | null>;
  deleteComment(
    commentId: string,
    authorId: string
  ): Promise<{ postId: string; commentCount: number } | null>;
}

const UUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})$/;

/** `(created_at DESC, id DESC)` — the thread's sort key, as an opaque token. */
interface CommentCursor {
  createdAt: string;
  id: string;
}

function encodeCommentCursor(cursor: CommentCursor): string {
  return Buffer.from(JSON.stringify({ t: cursor.createdAt, i: cursor.id })).toString('base64url');
}

function decodeCommentCursor(raw: string): CommentCursor | null {
  try {
    const parsed = JSON.parse(Buffer.from(raw, 'base64url').toString()) as Record<string, unknown>;
    const { t, i } = parsed;
    if (typeof t !== 'string' || typeof i !== 'string') return null;
    // The stamp is interpolated into a PostgREST filter, so it is re-validated:
    // `,`, `(` and `)` are the `or()` delimiters and must never reach it.
    if (!ISO_TIMESTAMP.test(t) || !UUID.test(i)) return null;
    return { createdAt: t, id: i };
  } catch {
    return null;
  }
}

function commentCursorFilter(cursor: CommentCursor): string {
  return `created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`;
}

/** The post's live comment count, with no cursor narrowing it to a remainder. */
async function countLiveComments(
  supabase: SupabaseClient<Database>,
  postId: string
): Promise<number> {
  const { count, error } = await supabase
    .from('post_comments')
    .select('id', { count: 'exact', head: true })
    .eq('post_id', postId)
    .is('deleted_at', null);

  if (error) throw error;
  return count ?? 0;
}

export function createPostEngagementRepository(
  supabase: SupabaseClient<Database>
): PostEngagementRepository {
  async function listComments(
    postId: string,
    cursor: string | null,
    pageSize: number,
    viewerId: string | null = null
  ): Promise<PostCommentPage> {
    const decoded = cursor ? decodeCommentCursor(cursor) : null;

    // A signed-in viewer reads through the block-aware function: the filter has
    // to run before the keyset limit or a page comes back short. The public
    // total is read separately, so it stays the count the feed's action bar
    // prints even when this viewer cannot see every row behind it (ADR-0217).
    if (viewerId) {
      const [{ data, error }, liveTotal] = await Promise.all([
        supabase.rpc('post_comments_page', {
          p_post_id: postId,
          p_viewer_id: viewerId,
          p_cursor_at: decoded?.createdAt ?? null,
          p_cursor_id: decoded?.id ?? null,
          p_limit: pageSize,
        }),
        countLiveComments(supabase, postId),
      ]);
      if (error) throw error;

      const rows = (data ?? []).map((row) => ({
        id: row.id,
        postId,
        authorId: row.author_id,
        body: row.body,
        createdAt: row.created_at,
        editedAt: row.edited_at,
      }));

      const hasMore = rows.length > pageSize;
      const page = hasMore ? rows.slice(0, pageSize) : rows;
      const last = page[page.length - 1];

      return {
        rows: page,
        nextCursor:
          hasMore && last ? encodeCommentCursor({ createdAt: last.createdAt, id: last.id }) : null,
        total: liveTotal,
      };
    }

    // A guest has no block rows, so the plain table read is still the cheapest
    // path: the first page gets its rows and its count in one request.
    let query = supabase
      .from('post_comments')
      .select('id, post_id, author_id, body, created_at, edited_at', { count: 'exact' })
      .eq('post_id', postId)
      .is('deleted_at', null);

    if (decoded) query = query.or(commentCursorFilter(decoded));

    const [{ data, error, count }, liveTotal] = await Promise.all([
      query
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(pageSize + 1),
      decoded ? countLiveComments(supabase, postId) : Promise.resolve(null),
    ]);

    if (error) throw error;

    const rows = (data ?? []).map((row) => ({
      id: row.id,
      postId: row.post_id,
      authorId: row.author_id,
      body: row.body,
      createdAt: row.created_at,
      editedAt: row.edited_at,
    }));

    const hasMore = rows.length > pageSize;
    const page = hasMore ? rows.slice(0, pageSize) : rows;
    const last = page[page.length - 1];

    return {
      rows: page,
      nextCursor:
        hasMore && last ? encodeCommentCursor({ createdAt: last.createdAt, id: last.id }) : null,
      total: liveTotal ?? count ?? page.length,
    };
  }

  return guardRepositoryMethods<PostEngagementRepository>({
    async findPostIdBySlug(slug): Promise<string | null> {
      const { data, error } = await supabase
        .from('posts')
        .select('id')
        .eq('slug', slug)
        .eq('status', 'published')
        .eq('community_visible', true)
        .is('deleted_at', null)
        .maybeSingle();

      if (error && !isNotFoundError(error)) throw error;
      return data?.id ?? null;
    },

    async counts(postIds): Promise<Record<string, PostEngagementCounts>> {
      const unique = [...new Set(postIds)];
      if (unique.length === 0) return {};

      const { data, error } = await supabase.rpc('post_engagement_counts', {
        p_post_ids: unique,
      });
      if (error) throw error;

      // Every requested id answers, including the zeros: the function left-joins
      // the ids it was handed, so a client never has to fill a gap itself.
      const counts: Record<string, PostEngagementCounts> = {};
      for (const id of unique) counts[id] = { likes: 0, comments: 0 };
      for (const row of data ?? []) {
        counts[row.post_id] = {
          likes: Number(row.like_count),
          comments: Number(row.comment_count),
        };
      }
      return counts;
    },

    async likedAmong(userId, postIds): Promise<string[]> {
      const unique = [...new Set(postIds)];
      if (unique.length === 0) return [];

      const { data, error } = await supabase
        .from('post_likes')
        .select('post_id')
        .eq('user_id', userId)
        .in('post_id', unique);

      if (error) throw error;
      return (data ?? []).map((row) => row.post_id);
    },

    async setLike(postId, userId, liked) {
      const { data, error } = await supabase.rpc('post_like', {
        p_post_id: postId,
        p_user_id: userId,
        p_like: liked,
      });
      if (error) throw error;

      const row = data?.[0];
      return { liked: row?.liked ?? false, likeCount: Number(row?.like_count ?? 0) };
    },

    listComments,

    async postAuthor(postId) {
      const { data, error } = await supabase
        .from('posts')
        .select('author_id')
        .eq('id', postId)
        .maybeSingle();
      if (error && !isNotFoundError(error)) throw error;
      return data?.author_id ?? null;
    },

    async authorsByIds(ids): Promise<Record<string, PostCommentAuthorRow>> {
      const unique = [...new Set(ids)];
      if (unique.length === 0) return {};

      const { data, error } = await supabase
        .from('users')
        .select('id, username, name, avatar_url')
        .in('id', unique);

      if (error) throw error;

      const authors: Record<string, PostCommentAuthorRow> = {};
      for (const row of data ?? []) {
        authors[row.id] = {
          id: row.id,
          username: row.username,
          name: row.name,
          avatarUrl: row.avatar_url,
        };
      }
      return authors;
    },

    async commentWriteGate(postId, authorId) {
      const { data, error } = await supabase.rpc('post_comment_write_gate', {
        p_post_id: postId,
        p_author_id: authorId,
      });
      if (error) throw error;
      return (data ?? 'ok') as 'ok' | 'unverified' | 'blocked';
    },

    async getComment(commentId): Promise<PostCommentRow | null> {
      const { data, error } = await supabase
        .from('post_comments')
        .select('id, post_id, author_id, body, created_at, edited_at')
        .eq('id', commentId)
        .is('deleted_at', null)
        .maybeSingle();

      if (error && !isNotFoundError(error)) throw error;
      if (!data) return null;

      return {
        id: data.id,
        postId: data.post_id,
        authorId: data.author_id,
        body: data.body,
        createdAt: data.created_at,
        editedAt: data.edited_at,
      };
    },

    async createComment(postId, authorId, body) {
      const { data, error } = await supabase.rpc('post_comment_create', {
        p_post_id: postId,
        p_author_id: authorId,
        p_body: body,
      });
      if (error) throw error;

      const row = data?.[0];
      if (!row) return null;
      return { id: row.id, createdAt: row.created_at, commentCount: Number(row.comment_count) };
    },

    async updateComment(commentId, authorId, body) {
      const { data, error } = await supabase.rpc('post_comment_update', {
        p_comment_id: commentId,
        p_author_id: authorId,
        p_body: body,
      });
      if (error) throw error;

      const row = data?.[0];
      if (!row) return null;
      return { id: row.id, body: row.body, editedAt: row.edited_at };
    },

    async deleteComment(commentId, authorId) {
      const { data, error } = await supabase.rpc('post_comment_delete', {
        p_comment_id: commentId,
        p_author_id: authorId,
      });
      if (error) throw error;

      const row = data?.[0];
      if (!row) return null;
      return { postId: row.post_id, commentCount: Number(row.comment_count) };
    },
  });
}
