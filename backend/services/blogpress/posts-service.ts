import type { PostsRepository } from '@/backend/repositories/blogpress/posts-repository';
import type { RestorePostSnapshot } from '@/shared/contracts/blogpress';
import type { PostInput } from '@/shared/contracts/community';

/**
 * The Blogpress post module. Its interface is only the operations that carry
 * rules — publish visibility gating, duplication, restore, and the bulk
 * transition that reuses the publish gate. Pure reads and single-writes cross
 * the repository seam directly.
 *
 * Publishing is deliberately silent: it writes no notification, because a
 * notice for every post is noise the Admin audience cannot afford.
 */
export class BlogpressPostsService {
  constructor(private readonly repository: PostsRepository) {}

  async saveAndPublishPost(
    postId: string,
    authorId: string,
    data: PostInput
  ): Promise<{ slug: string }> {
    return this.repository.saveAndPublishPost(postId, authorId, data);
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
    return this.repository.createAndPublishPost(authorId, data);
  }

  async publishPost(postId: string, authorId: string): Promise<{ slug: string }> {
    return this.repository.publishPost(postId, authorId);
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
