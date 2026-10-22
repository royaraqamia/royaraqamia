import {
  createBlogpressMediaService,
  createBlogpressPostsModule,
} from '@/backend/config/blogpress';
import { createPlanGate } from '@/backend/config/plans';
import { errorResult } from '@/backend/middleware/http';
import { OWNED_ITEMS, USAGE_ACTIONS } from '@/shared/contracts/plans';
import {
  PostSchema,
  TagInputSchema,
  PostTagIdsSchema,
  BulkPostsActionSchema,
  SchedulePostSchema,
  type PostInput,
} from '@/shared/contracts/community';
import { RestorePostSnapshotSchema } from '@/shared/contracts/blogpress';
import {
  jsonResult,
  type HttpResult,
  type RevalidationHint,
} from '@/backend/transport/http-result';
import { messageError } from '@/backend/transport/authenticated-handler';
import { withAuthenticatedUser } from '@/backend/transport/session-handler';
import { COMMUNITY_MUTATION_TAGS } from '@/backend/shared/community-cache-tags';

function postRevalidation(slug: string): RevalidationHint[] {
  return [{ path: '/blogpress' }, { path: `/community/${slug}` }, { path: '/community' }];
}

function publishRevalidation(slug: string): RevalidationHint[] {
  return [...postRevalidation(slug), { path: '/sitemap.xml' }];
}

/**
 * The BlogPress sync endpoint (ADR-0060): the full owned snapshot for the client
 * pull, including tombstones so another device's delete lands here. Answers 401
 * without a session; the pull's callers listen for that on the next open.
 */
export async function syncBlogpress(): Promise<HttpResult> {
  return withAuthenticatedUser(
    async ({ userId, supabase }) => {
      const { repository } = createBlogpressPostsModule(supabase);
      const posts = await repository.listPostsByAuthorIncludingDeleted(userId);
      return jsonResult(200, { posts });
    },
    { mapError: messageError(500, 'فشل مزامنة المنشورات') }
  );
}

export async function createPost(body?: Record<string, unknown> | null): Promise<HttpResult> {
  return withAuthenticatedUser(
    async ({ userId, supabase }) => {
      // An offline replay sends the draft it minted locally; an online "new post"
      // sends nothing and the server mints the id (ADR-0029).
      let input: PostInput | undefined;
      if (body && Object.keys(body).length > 0) {
        const validated = PostSchema.safeParse(body);
        if (!validated.success) {
          return jsonResult(200, { errors: validated.error.flatten().fieldErrors });
        }
        input = validated.data;
      }
      const { repository } = createBlogpressPostsModule(supabase);
      const plan = createPlanGate();

      // A draft takes a draft slot; a post that arrives already published pays
      // the publish credit and takes a published slot (an offline replay of a
      // composer publish lands here).
      if (input?.status === 'published') {
        await plan.cap(userId, OWNED_ITEMS.communityPublished);
        const { id } = await plan.meter({ userId }, USAGE_ACTIONS.communityPostPublish, () =>
          repository.createPost(userId, input)
        );
        return jsonResult(200, { id });
      }

      await plan.cap(userId, OWNED_ITEMS.communityDrafts);
      const { id } = await repository.createPost(userId, input);
      return jsonResult(200, { id });
    },
    { mapError: errorResult }
  );
}

export async function updatePost(id: string, body: Record<string, unknown>): Promise<HttpResult> {
  return withAuthenticatedUser(
    async ({ userId, supabase }) => {
      const validated = PostSchema.safeParse(body);

      if (!validated.success) {
        return jsonResult(200, { errors: validated.error.flatten().fieldErrors });
      }

      const { repository } = createBlogpressPostsModule(supabase);
      await createPlanGate().meter({ userId }, USAGE_ACTIONS.communityPostEdit, () =>
        repository.updatePost(id, userId, validated.data)
      );

      return jsonResult(
        200,
        { message: 'تمَّ حفظ المنشور' },
        {
          revalidate: [
            ...postRevalidation(validated.data.slug),
            { path: `/blogpress/editor/${id}` },
          ],
          tags: COMMUNITY_MUTATION_TAGS,
        }
      );
    },
    { mapError: errorResult }
  );
}

export async function deletePost(
  id: string,
  body?: Record<string, unknown> | null
): Promise<HttpResult> {
  return withAuthenticatedUser(
    async ({ userId, supabase }) => {
      const { repository } = createBlogpressPostsModule(supabase);
      // The Outbox delete intent carries the logical write time so the
      // tombstone keeps write order (ADR-0029); an online delete has none and
      // the repository stamps it with now.
      const updatedAt = typeof body?.updatedAt === 'string' ? body.updatedAt : undefined;
      const { slug } = await repository.deletePost(id, userId, updatedAt);

      return jsonResult(
        200,
        { success: true },
        {
          // A replay of an already-tombstoned row resolves without a slug;
          // there is nothing left to revalidate then.
          revalidate: slug ? postRevalidation(slug) : [],
          tags: COMMUNITY_MUTATION_TAGS,
        }
      );
    },
    { mapError: messageError(500, 'فشل حذف المنشور') }
  );
}

export async function duplicatePost(id: string): Promise<HttpResult> {
  return withAuthenticatedUser(
    async ({ userId, supabase }) => {
      const { posts } = createBlogpressPostsModule(supabase);
      const plan = createPlanGate();
      await plan.cap(userId, OWNED_ITEMS.communityDrafts);
      const { id: newId } = await plan.meter({ userId }, USAGE_ACTIONS.communityPostDuplicate, () =>
        posts.duplicatePost(id, userId)
      );
      return jsonResult(200, { success: true, id: newId });
    },
    { mapError: errorResult }
  );
}

export async function restorePost(body: Record<string, unknown>): Promise<HttpResult> {
  return withAuthenticatedUser(
    async ({ userId, userEmail, supabase }) => {
      const validated = RestorePostSnapshotSchema.safeParse(body);
      if (!validated.success) {
        return jsonResult(400, { error: 'بيانات استرجاع المنشور غير صالحة' });
      }

      const { posts } = createBlogpressPostsModule(supabase);
      const { id } = await posts.restorePost(userId, validated.data, userEmail);

      return jsonResult(
        200,
        { success: true, id },
        {
          revalidate: postRevalidation(validated.data.slug),
          tags: COMMUNITY_MUTATION_TAGS,
        }
      );
    },
    { mapError: messageError(500, 'فشل استرجاع المنشور') }
  );
}

export async function publishPost(id: string): Promise<HttpResult> {
  return withAuthenticatedUser(
    async ({ userId, supabase }) => {
      const { posts } = createBlogpressPostsModule(supabase);
      const plan = createPlanGate();
      await plan.cap(userId, OWNED_ITEMS.communityPublished);
      const { slug } = await plan.meter({ userId }, USAGE_ACTIONS.communityPostPublish, () =>
        posts.publishPost(id, userId)
      );

      return jsonResult(
        200,
        { success: true },
        { revalidate: publishRevalidation(slug), tags: COMMUNITY_MUTATION_TAGS }
      );
    },
    { mapError: errorResult }
  );
}

export async function unpublishPost(id: string): Promise<HttpResult> {
  return withAuthenticatedUser(
    async ({ userId, supabase }) => {
      const { repository } = createBlogpressPostsModule(supabase);
      const { slug } = await repository.unpublishPost(id, userId);

      return jsonResult(
        200,
        { success: true },
        { revalidate: publishRevalidation(slug), tags: COMMUNITY_MUTATION_TAGS }
      );
    },
    { mapError: messageError(500, 'فشل إلغاء النَّشر') }
  );
}

export async function schedulePost(id: string, body: Record<string, unknown>): Promise<HttpResult> {
  return withAuthenticatedUser(
    async ({ userId, supabase }) => {
      const validated = SchedulePostSchema.safeParse(body);
      if (!validated.success) return jsonResult(400, { error: 'تاريخ الجدولة غير صالح' });

      const { repository } = createBlogpressPostsModule(supabase);
      const { slug } = await repository.schedulePost(id, userId, validated.data.publish_at);

      return jsonResult(
        200,
        { success: true },
        {
          revalidate: [...postRevalidation(slug), { path: '/blogpress/calendar' }],
          tags: COMMUNITY_MUTATION_TAGS,
        }
      );
    },
    { mapError: messageError(500, 'فشل جدولة المنشور') }
  );
}

export async function setPostFeatured(id: string, featured: boolean): Promise<HttpResult> {
  return withAuthenticatedUser(
    async ({ userId, supabase }) => {
      const { repository } = createBlogpressPostsModule(supabase);
      await repository.setPostFeatured(id, userId, featured);
      return jsonResult(200, { success: true }, { revalidate: [{ path: '/blogpress' }] });
    },
    { mapError: messageError(500, 'فشل تحديث تثبيت المنشور') }
  );
}

export async function bulkPostsAction(body: Record<string, unknown>): Promise<HttpResult> {
  return withAuthenticatedUser(
    async ({ userId, supabase }) => {
      const validated = BulkPostsActionSchema.safeParse(body);
      if (!validated.success) {
        return jsonResult(400, { error: 'بيانات الإجراء غير صالحة' });
      }

      const { action, postIds, categoryId } = validated.data;
      const { posts, repository } = createBlogpressPostsModule(supabase);
      const plan = createPlanGate();

      if (action === 'setCategory') {
        if (!categoryId) return jsonResult(400, { error: 'اختر تصنيفاً' });
        await repository.bulkSetPostCategories(postIds, userId, categoryId);
        return jsonResult(
          200,
          { success: true, affected: postIds.length },
          { revalidate: [{ path: '/blogpress' }], tags: COMMUNITY_MUTATION_TAGS }
        );
      }

      if (action === 'publish') {
        await plan.cap(userId, OWNED_ITEMS.communityPublished, postIds.length);
      }

      const { affected, slugs } = await plan.meterMany(
        userId,
        USAGE_ACTIONS.communityPostPublish,
        action === 'publish' ? postIds.length : 0,
        () => posts.bulkActionPosts(postIds, userId, action)
      );

      if (action === 'publish' || action === 'unpublish') {
        return jsonResult(
          200,
          { success: true, affected },
          {
            revalidate: slugs.flatMap((slug) => publishRevalidation(slug)),
            tags: COMMUNITY_MUTATION_TAGS,
          }
        );
      }

      return jsonResult(
        200,
        { success: true, affected },
        {
          revalidate: slugs.flatMap((slug) => postRevalidation(slug)),
          tags: COMMUNITY_MUTATION_TAGS,
        }
      );
    },
    { mapError: messageError(500, 'فشل تنفيذ الإجراء على المنشورات') }
  );
}

export async function saveAndPublishPost(
  id: string,
  body: Record<string, unknown>
): Promise<HttpResult> {
  return withAuthenticatedUser(
    async ({ userId, supabase }) => {
      const validated = PostSchema.safeParse(body);

      if (!validated.success) {
        return jsonResult(200, { errors: validated.error.flatten().fieldErrors });
      }

      const { posts } = createBlogpressPostsModule(supabase);
      const plan = createPlanGate();
      await plan.cap(userId, OWNED_ITEMS.communityPublished);
      const { slug } = await plan.meter({ userId }, USAGE_ACTIONS.communityPostPublish, () =>
        posts.saveAndPublishPost(id, userId, validated.data)
      );

      return jsonResult(
        200,
        { success: true, slug },
        { revalidate: publishRevalidation(slug), tags: COMMUNITY_MUTATION_TAGS }
      );
    },
    { mapError: errorResult }
  );
}

export async function uploadMedia(formData: FormData): Promise<HttpResult> {
  return withAuthenticatedUser(
    async ({ userId, supabase }) => {
      const plan = createPlanGate();
      // The service answers a rejected file with a message rather than throwing,
      // so the reservation is released explicitly on that path.
      const reservation = await plan.reserve(userId, USAGE_ACTIONS.communityMediaUpload);
      const result = await createBlogpressMediaService(supabase).uploadImage(formData, userId);
      if ('error' in result) await plan.release(userId, reservation);
      return jsonResult(200, result);
    },
    { mapError: errorResult }
  );
}

export async function listBlogTags(): Promise<HttpResult> {
  return withAuthenticatedUser(
    async ({ userId, supabase }) => {
      const { repository } = createBlogpressPostsModule(supabase);
      const tags = await repository.listTagsByAuthor(userId);
      return jsonResult(200, { tags });
    },
    { mapError: messageError(500, 'فشل جلب الوسوم') }
  );
}

export async function createBlogTag(body: Record<string, unknown>): Promise<HttpResult> {
  return withAuthenticatedUser(
    async ({ userId, supabase }) => {
      const validated = TagInputSchema.safeParse(body);
      if (!validated.success) {
        return jsonResult(200, { errors: validated.error.flatten().fieldErrors });
      }

      const { repository } = createBlogpressPostsModule(supabase);
      await createPlanGate().cap(userId, OWNED_ITEMS.communityTags);
      const tag = await repository.createTag(userId, validated.data.name, validated.data.slug);

      return jsonResult(200, { tag });
    },
    { mapError: errorResult }
  );
}

export async function deleteBlogTag(id: string): Promise<HttpResult> {
  return withAuthenticatedUser(
    async ({ userId, supabase }) => {
      const { repository } = createBlogpressPostsModule(supabase);
      await repository.deleteTag(id, userId);
      return jsonResult(200, { success: true });
    },
    { mapError: messageError(500, 'فشل حذف الوسم') }
  );
}

export async function setBlogPostTags(
  id: string,
  body: Record<string, unknown>
): Promise<HttpResult> {
  return withAuthenticatedUser(
    async ({ userId, supabase }) => {
      const validated = PostTagIdsSchema.safeParse(body);
      if (!validated.success) {
        return jsonResult(200, { errors: validated.error.flatten().fieldErrors });
      }

      const { repository } = createBlogpressPostsModule(supabase);
      await repository.setPostTags(id, userId, validated.data.tagIds);

      return jsonResult(
        200,
        { success: true },
        { revalidate: [{ path: `/blogpress/editor/${id}` }], tags: COMMUNITY_MUTATION_TAGS }
      );
    },
    { mapError: messageError(500, 'فشل تحديث وسوم المنشور') }
  );
}
