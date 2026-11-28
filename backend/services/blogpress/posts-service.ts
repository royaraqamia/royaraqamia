import type { PostsRepository } from '@/backend/repositories/blogpress/posts-repository';
import type { PostPublishedNotifier } from '@/backend/config/notifications';
import type { PostSourceKind, RestorePostSnapshot } from '@/shared/contracts/blogpress';
import type { PostInput } from '@/shared/contracts/community';

/** What a draft create carries, and the artifact it came from when there is one. */
export interface PostDraftInput {
  slug: string;
  content: string;
  metaTitle: string;
  /** The note or answer this draft was made from (#1952); absent for a typed post. */
  source?: { kind: PostSourceKind; ref: string };
}

/**
 * The Blogpress post module. Its interface is only the operations that carry
 * rules — publish visibility gating, duplication, restore, and the bulk
 * transition that reuses the publish gate. Pure reads and single-writes cross
 * the repository seam directly.
 *
 * A publish tells the author's followers, not a role (#1752). The notifier is
 * injected: the rule about who receives it lives in `backend/config/notifications`,
 * and this service only reports the event. Bulk publish stays silent, as it did
 * before the retirement — it is a moderation action, not a member's new post.
 */
export class BlogpressPostsService {
  constructor(
    private readonly repository: PostsRepository,
    private readonly onPostPublished?: PostPublishedNotifier
  ) {}

  async saveAndPublishPost(
    postId: string,
    authorId: string,
    data: PostInput
  ): Promise<{ slug: string }> {
    const result = await this.repository.saveAndPublishPost(postId, authorId, data);
    this.onPostPublished?.({ postId, authorId, slug: result.slug });
    return result;
  }

  /**
   * One draft create, wherever the words came from (#1952).
   *
   * The assistant's `create_post_draft` tool and the artifact door both come
   * through here, so a member's byline and the row's shape are decided once.
   * An artifact draft also records its source in a second write: the create RPC
   * is the offline contract's and cannot carry a column the client owns, while
   * the marker is the door's own fact and must never be client-settable.
   */
  async createDraft(authorId: string, input: PostDraftInput): Promise<{ id: string }> {
    const { id } = await this.repository.createPost(authorId, {
      slug: input.slug,
      content: input.content,
      meta_title: input.metaTitle,
    });

    if (input.source) {
      await this.repository.setPostSource(id, authorId, input.source);
    }

    return { id };
  }

  /**
   * A brand-new post that is published in the same write (#527): the composer
   * no longer creates a draft first, so a free account holding its draft
   * allowance can still publish. The server sets the publication columns.
   */
  async createAndPublishPost(
    authorId: string,
    data: PostInput
  ): Promise<{ id: string; slug: string }> {
    const result = await this.repository.createAndPublishPost(authorId, data);
    this.onPostPublished?.({ postId: result.id, authorId, slug: result.slug });
    return result;
  }

  async publishPost(postId: string, authorId: string): Promise<{ slug: string }> {
    const result = await this.repository.publishPost(postId, authorId);
    this.onPostPublished?.({ postId, authorId, slug: result.slug });
    return result;
  }

  async restorePost(authorId: string, snapshot: RestorePostSnapshot): Promise<{ slug: string }> {
    const slug = snapshot.slug?.trim();
    if (!snapshot.id && !slug) {
      throw new Error('معرِّف المنشور أو رابطه مطلوب');
    }

    // Only the tombstone's handle and its stamp cross the seam (#1518). The
    // body, the metadata and the tags are already on the row the request
    // revives, so nothing the editor sent earlier travels back with the undo.
    return this.repository.restorePost(authorId, {
      ...(snapshot.id ? { id: snapshot.id } : {}),
      ...(slug ? { slug } : {}),
      ...(snapshot.updatedAt ? { updatedAt: snapshot.updatedAt } : {}),
    });
  }

  async bulkActionPosts(
    postIds: string[],
    authorId: string,
    action: 'publish' | 'unpublish' | 'delete'
  ): Promise<{ affected: number; slugs: string[] }> {
    return this.repository.bulkActionPosts(postIds, authorId, action);
  }
}
