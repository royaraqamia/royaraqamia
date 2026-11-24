import type { NotificationProducer } from '@/backend/config/notifications';
import type {
  PostCommentAuthorRow,
  PostCommentRow,
  PostEngagementRepository,
} from '@/backend/repositories/blogpress/post-engagement-repository';
import {
  POST_COMMENT_REPORT_LIMIT,
  POST_COMMENT_WRITE_LIMIT,
  POST_ENGAGEMENT_WRITE_WINDOW_MS,
  POST_LIKE_WRITE_LIMIT,
  type PostComment,
  type PostCommentsResponse,
  type PostEngagement,
} from '@/shared/contracts/community';

/** A refusal the caller must be told about, with the status it means. */
export class PostEngagementRefusedError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
    this.name = 'PostEngagementRefusedError';
  }
}

export interface PostEngagementServiceDeps {
  engagement: PostEngagementRepository;
  /** Fail-safe: a notification never blocks the comment that caused it. */
  notify: NotificationProducer;
  checkRateLimit: (key: string, limit: number, windowMs: number) => Promise<boolean>;
}

/**
 * Likes and comments, as rules.
 *
 * What the database already guarantees (only a public post may be liked or
 * commented on, an edit and a delete are the author's own, a throwaway delete
 * leaves the thread intact) is not re-checked here. What lives here is the one
 * rule Postgres does not hold — the per-member write budget — and the join that
 * turns a stored row into the shape both clients draw.
 *
 * Every write answers the post's fresh count, so no client has to guess whether
 * its optimistic number survived the trip.
 */
export class PostEngagementService {
  constructor(private readonly deps: PostEngagementServiceDeps) {}

  /** The numbers and the viewer's own like, for a set of posts, in two reads. */
  async statesFor(
    viewerId: string | null,
    postIds: string[]
  ): Promise<Record<string, PostEngagement>> {
    const unique = [...new Set(postIds)];
    if (unique.length === 0) return {};

    const [counts, liked] = await Promise.all([
      this.deps.engagement.counts(unique),
      viewerId ? this.deps.engagement.likedAmong(viewerId, unique) : Promise.resolve([]),
    ]);

    const likedSet = new Set(liked);
    const states: Record<string, PostEngagement> = {};
    for (const id of unique) {
      states[id] = {
        postId: id,
        likeCount: counts[id]?.likes ?? 0,
        commentCount: counts[id]?.comments ?? 0,
        liked: likedSet.has(id),
      };
    }
    return states;
  }

  async setLike(
    viewerId: string,
    slug: string,
    liked: boolean
  ): Promise<{ liked: boolean; likeCount: number }> {
    await this.assertUnderLimit(`post-like:${viewerId}`, POST_LIKE_WRITE_LIMIT);

    const postId = await this.postIdOf(slug);
    return this.deps.engagement.setLike(postId, viewerId, liked);
  }

  /**
   * One keyed page of a thread, its page cursor and the post's public total.
   * A signed-in viewer's blocks hide the authors they cannot see; a guest gets
   * the same thread a block-free member gets (ADR-0217).
   */
  async thread(
    slug: string,
    cursor: string | null,
    pageSize: number,
    viewerId: string | null = null
  ): Promise<PostCommentsResponse> {
    const postId = await this.postIdOf(slug);
    const page = await this.deps.engagement.listComments(postId, cursor, pageSize, viewerId);
    const comments = await this.hydrate(page.rows);

    return { comments, nextCursor: page.nextCursor, total: page.total };
  }

  async comment(
    viewerId: string,
    slug: string,
    body: string
  ): Promise<{ comment: PostComment; commentCount: number }> {
    await this.assertUnderLimit(`post-comment:${viewerId}`, POST_COMMENT_WRITE_LIMIT);

    const postId = await this.postIdOf(slug);

    // The database repeats this gate inside the write function, so it stays the
    // authority. The read here only turns a refusal into a sentence the member
    // can act on instead of a generic failure.
    const gate = await this.deps.engagement.commentWriteGate(postId, viewerId);
    if (gate === 'blocked') {
      throw new PostEngagementRefusedError(403, 'لا يمكنك التعليق على منشور بينك وبين صاحبه حظر.');
    }
    if (gate === 'unverified') {
      throw new PostEngagementRefusedError(403, 'يجب تأكيد بريدك الإلكتروني قبل التعليق.');
    }

    const written = await this.deps.engagement.createComment(postId, viewerId, body);
    if (!written) {
      throw new PostEngagementRefusedError(404, 'المنشور غير موجود.');
    }

    const [comment] = await this.hydrate([
      {
        id: written.id,
        postId,
        authorId: viewerId,
        body,
        createdAt: written.createdAt,
        editedAt: null,
      },
    ]);

    if (!comment) throw new PostEngagementRefusedError(404, 'التعليق غير موجود.');

    // The row is written. From here nothing may fail the member's request: the
    // post's author is read and the notice produced off the write's path.
    void this.deliverCommentNotice(postId, slug, viewerId, comment);

    return { comment, commentCount: written.commentCount };
  }

  /**
   * One notice for one reply, to the post's host and never to the writer.
   *
   * ADR-0217 makes the host the thread's moderator, so the sentence points at a
   * thread they can clear. A blocked pair cannot write here at all, and a hidden
   * member's byline still draws, so naming the writer tells the host what the
   * thread shows. Both failures - the host read and the producer - are swallowed:
   * a comment that was written must never come back as a failed request.
   */
  private async deliverCommentNotice(
    postId: string,
    slug: string,
    viewerId: string,
    comment: PostComment
  ): Promise<void> {
    try {
      const host = await this.deps.engagement.postAuthor(postId);
      if (!host || host === viewerId) return;

      const who =
        comment.author?.name?.trim() ||
        (comment.author?.username ? `@${comment.author.username}` : 'عضو');
      const text = comment.body.trim().replace(/\s+/g, ' ');
      const excerpt = text.slice(0, 120) + (text.length > 120 ? '…' : '');

      await this.deps.notify({
        user_id: host,
        type: 'post_comment',
        title: 'تعليق جديد على منشورك',
        body: `تعليق جديد من ${who}: «${excerpt}». يمكنك حذفه من منشورك.`,
        metadata: { post_slug: slug, comment_id: comment.id },
      });
    } catch {
      // The producer is fail-safe by contract; a read failure must be too.
    }
  }

  async editComment(
    viewerId: string,
    commentId: string,
    body: string
  ): Promise<{ comment: PostComment }> {
    await this.assertUnderLimit(`post-comment:${viewerId}`, POST_COMMENT_WRITE_LIMIT);

    // The read is what makes "not yours" and "not there" different answers, and
    // what carries the post id the function does not return.
    const existing = await this.deps.engagement.getComment(commentId);
    if (!existing) throw new PostEngagementRefusedError(404, 'التعليق غير موجود.');
    if (existing.authorId !== viewerId) {
      throw new PostEngagementRefusedError(403, 'لا يمكنك تعديل تعليق عضو آخر.');
    }

    const written = await this.deps.engagement.updateComment(commentId, viewerId, body);
    if (!written) throw new PostEngagementRefusedError(404, 'التعليق غير موجود.');

    const [comment] = await this.hydrate([
      { ...existing, body: written.body, editedAt: written.editedAt },
    ]);

    if (!comment) throw new PostEngagementRefusedError(404, 'التعليق غير موجود.');

    return { comment };
  }

  async deleteComment(
    viewerId: string,
    commentId: string
  ): Promise<{ deleted: boolean; commentCount: number }> {
    const existing = await this.deps.engagement.getComment(commentId);
    if (!existing) throw new PostEngagementRefusedError(404, 'التعليق غير موجود.');
    if (existing.authorId !== viewerId) {
      // ADR-0217: the post's host may clear a reply. The write function repeats
      // the same rule, so this read only makes a refusal answerable to a member.
      const host = await this.deps.engagement.postAuthor(existing.postId);
      if (host !== viewerId) {
        throw new PostEngagementRefusedError(403, 'لا يمكنك حذف تعليق عضو آخر.');
      }
    }

    const removed = await this.deps.engagement.deleteComment(commentId, viewerId);
    if (!removed) throw new PostEngagementRefusedError(404, 'التعليق غير موجود.');

    return { deleted: true, commentCount: removed.commentCount };
  }

  /** File a report; the frozen evidence is built by Postgres, not the caller. */
  async reportComment(
    viewerId: string,
    commentId: string,
    reason: string
  ): Promise<{ id: string; createdAt: string }> {
    await this.assertUnderLimit(`post-comment-report:${viewerId}`, POST_COMMENT_REPORT_LIMIT);

    const existing = await this.deps.engagement.getComment(commentId);
    if (!existing) throw new PostEngagementRefusedError(404, 'التعليق غير موجود.');

    const reported = await this.deps.engagement.reportComment(commentId, viewerId, reason);
    if (!reported) {
      // The unique (reporter, comment) pair makes a second report a no-op.
      throw new PostEngagementRefusedError(409, 'أبلغت عن هذا التعليق من قبل.');
    }
    return reported;
  }

  /** A slug that names no public post is the page's own 404, said now. */
  private async postIdOf(slug: string): Promise<string> {
    const postId = await this.deps.engagement.findPostIdBySlug(slug);
    if (!postId) throw new PostEngagementRefusedError(404, 'المنشور غير موجود.');
    return postId;
  }

  /** Joins the stored rows to their public authors, in one read for the page. */
  private async hydrate(rows: PostCommentRow[]): Promise<PostComment[]> {
    if (rows.length === 0) return [];

    const authors = await this.deps.engagement.authorsByIds(rows.map((row) => row.authorId));

    return rows.map((row) => {
      const author: PostCommentAuthorRow | undefined = authors[row.authorId];
      return {
        id: row.id,
        postId: row.postId,
        body: row.body,
        author: author
          ? {
              id: author.id,
              username: author.username,
              name: author.name,
              avatar_url: author.avatarUrl,
            }
          : null,
        createdAt: row.createdAt,
        editedAt: row.editedAt,
      };
    });
  }

  private async assertUnderLimit(key: string, limit: number): Promise<void> {
    const allowed = await this.deps.checkRateLimit(key, limit, POST_ENGAGEMENT_WRITE_WINDOW_MS);
    if (!allowed) {
      throw new PostEngagementRefusedError(
        429,
        'محاولات كثيرة في وقت قصير. أعد المحاولة بعد دقيقة.'
      );
    }
  }
}
