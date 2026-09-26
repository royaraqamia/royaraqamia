import type { PostsRepository } from '@/backend/repositories/blogpress/posts-repository';
import type { RestorePostSnapshot } from '@/shared/contracts/blogpress';
import type { PostInput } from '@/shared/contracts/blog';
import { isAdmin } from '@/backend/shared/admin-validator';

export interface PostPublishedNotifier {
  (info: { postId: string; authorId: string; slug: string }): void;
}

/**
 * The Blogpress post module. Its interface is only the operations that carry
 * rules — publish visibility gating, duplication, restore, and the bulk
 * transition that reuses the publish gate. Pure reads and single-writes cross
 * the repository seam directly.
 */
export class BlogpressPostsService {
  constructor(
    private readonly repository: PostsRepository,
    private readonly adminEmails: string[],
    private readonly onPostPublished?: PostPublishedNotifier
  ) {}

  async saveAndPublishPost(
    postId: string,
    authorId: string,
    data: PostInput,
    authorEmail: string
  ): Promise<{ slug: string }> {
    const blogVisible = isAdmin(authorEmail, this.adminEmails);
    const result = await this.repository.saveAndPublishPost(postId, authorId, data, blogVisible);
    this.onPostPublished?.({ postId, authorId, slug: result.slug });
    return result;
  }

  async publishPost(
    postId: string,
    authorId: string,
    authorEmail: string
  ): Promise<{ slug: string }> {
    const blogVisible = isAdmin(authorEmail, this.adminEmails);
    const result = await this.repository.publishPost(postId, authorId, blogVisible);
    this.onPostPublished?.({ postId, authorId, slug: result.slug });
    return result;
  }

  async restorePost(
    authorId: string,
    snapshot: RestorePostSnapshot,
    authorEmail = ''
  ): Promise<{ id: string }> {
    if (!snapshot.title || !snapshot.title.trim()) {
      throw new Error('عنوان المقال مطلوب');
    }
    if (!snapshot.slug || !snapshot.slug.trim()) {
      throw new Error('المعرّف (slug) مطلوب');
    }

    const blogVisible = isAdmin(authorEmail, this.adminEmails) && snapshot.blog_visible;
    const { id } = await this.repository.restorePost(authorId, {
      ...snapshot,
      blog_visible: blogVisible,
    });
    if (snapshot.tagIds && snapshot.tagIds.length > 0) {
      await this.repository.setPostTags(id, authorId, snapshot.tagIds);
    }
    return { id };
  }

  async duplicatePost(postId: string, authorId: string): Promise<{ id: string }> {
    const source = await this.repository.getPostForUser(postId, authorId);
    if (!source) {
      throw new Error('المقال غير موجود');
    }

    const { id } = await this.repository.createPost(authorId);

    const baseSlug = source.slug.replace(/-(copy|نسخة)-\d{4}$/i, '') || `post-${id.slice(0, 8)}`;
    const suffix = crypto.randomUUID().slice(0, 4);

    await this.repository.updatePost(id, authorId, {
      title: source.title ? `نسخة من ${source.title}` : '',
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
    action: 'publish' | 'unpublish' | 'delete',
    authorEmail?: string
  ): Promise<{ affected: number; slugs: string[] }> {
    const blogVisible =
      action === 'publish' ? isAdmin(authorEmail ?? '', this.adminEmails) : undefined;
    return this.repository.bulkActionPosts(postIds, authorId, action, blogVisible);
  }
}
