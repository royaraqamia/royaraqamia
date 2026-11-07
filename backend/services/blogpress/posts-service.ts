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

  async restorePost(authorId: string, snapshot: RestorePostSnapshot): Promise<{ id: string }> {
    if (!snapshot.slug || !snapshot.slug.trim()) {
      throw new Error('المعرِّف (slug) مطلوب');
    }

    // Only the content fields cross the seam. The repository revives the
    // tombstone, so the status and publication columns keep the values the
    // deleted row already had (#528).
    const { id } = await this.repository.restorePost(authorId, {
      ...(snapshot.id ? { id: snapshot.id } : {}),
      slug: snapshot.slug.trim(),
      content: snapshot.content,
      cover_image: snapshot.cover_image,
      meta_title: snapshot.meta_title,
      meta_desc: snapshot.meta_desc,
      ...(snapshot.tagIds ? { tagIds: snapshot.tagIds } : {}),
    });
    if (snapshot.tagIds && snapshot.tagIds.length > 0) {
      await this.repository.setPostTags(id, authorId, snapshot.tagIds);
    }
    return { id };
  }

  async duplicatePost(postId: string, authorId: string): Promise<{ id: string }> {
    const source = await this.repository.getPostForUser(postId, authorId);
    if (!source) {
      throw new Error('المنشور غير موجود');
    }

    const { id } = await this.repository.createPost(authorId);

    const baseSlug = source.slug.replace(/-(copy|نسخة)-\d{4}$/i, '') || `post-${id.slice(0, 8)}`;
    const suffix = crypto.randomUUID().slice(0, 4);

    await this.repository.updatePost(id, authorId, {
      slug: `${baseSlug}-copy-${suffix}`,
      content: source.content ?? '',
      cover_image: source.cover_image ?? '',
      meta_title: source.meta_title ?? '',
      meta_desc: source.meta_desc ?? '',
    });

    const tags = await this.repository.getPostTags(postId);
    if (tags.length > 0) {
      await this.repository.setPostTags(
        id,
        authorId,
        tags.map((tag) => tag.id)
      );
    }

    const categories = await this.repository.getPostCategories(postId);
    if (categories.length > 0) {
      await this.repository.setPostCategories(
        id,
        authorId,
        categories.map((c) => c.id)
      );
    }

    return { id };
  }

  async bulkActionPosts(
    postIds: string[],
    authorId: string,
    action: 'publish' | 'unpublish' | 'delete'
  ): Promise<{ affected: number; slugs: string[] }> {
    return this.repository.bulkActionPosts(postIds, authorId, action);
  }
}
