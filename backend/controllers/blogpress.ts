import {
  createBlogpressMediaService,
  createBlogpressPostsModule,
} from '@/backend/config/blogpress';
import {
  PostSchema,
  TagInputSchema,
  PostTagIdsSchema,
  BulkPostsActionSchema,
  SchedulePostSchema,
} from '@/shared/contracts/blog';
import { RestorePostSnapshotSchema } from '@/shared/contracts/blogpress';
import {
  jsonResult,
  type HttpResult,
  type RevalidationHint,
} from '@/backend/transport/http-result';
import { messageError } from '@/backend/transport/authenticated-handler';
import { withAuthenticatedUser } from '@/backend/transport/session-handler';
import { BLOG_MUTATION_TAGS } from '@/backend/shared/blog-cache-tags';

function postRevalidation(slug: string): RevalidationHint[] {
  return [{ path: '/blogpress' }, { path: `/blog/${slug}` }, { path: '/blog' }];
}

function publishRevalidation(slug: string): RevalidationHint[] {
  return [...postRevalidation(slug), { path: '/sitemap.xml' }];
}

export async function createPost(): Promise<HttpResult> {
  return withAuthenticatedUser(
    async ({ userId, supabase }) => {
      const { repository } = createBlogpressPostsModule(supabase);
      const { id } = await repository.createPost(userId);
      return jsonResult(200, { id });
    },
    { mapError: messageError(500, 'فشل إنشاء المقال') }
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
      await repository.updatePost(id, userId, validated.data);

      return jsonResult(
        200,
        { message: 'تمَّ حفظ المقال' },
        {
          revalidate: [
            ...postRevalidation(validated.data.slug),
            { path: `/blogpress/editor/${id}` },
          ],
          tags: BLOG_MUTATION_TAGS,
        }
      );
    },
    { mapError: messageError(500, 'فشل حفظ المقال', 'message') }
  );
}

export async function deletePost(id: string): Promise<HttpResult> {
  return withAuthenticatedUser(
    async ({ userId, supabase }) => {
      const { repository } = createBlogpressPostsModule(supabase);
      const { slug } = await repository.deletePost(id, userId);

      return jsonResult(
        200,
        { success: true },
        { revalidate: postRevalidation(slug), tags: BLOG_MUTATION_TAGS }
      );
    },
    { mapError: messageError(500, 'فشل حذف المقال') }
  );
}

export async function duplicatePost(id: string): Promise<HttpResult> {
  return withAuthenticatedUser(
    async ({ userId, supabase }) => {
      const { posts } = createBlogpressPostsModule(supabase);
      const { id: newId } = await posts.duplicatePost(id, userId);
      return jsonResult(200, { success: true, id: newId });
    },
    { mapError: messageError(500, 'فشل نسخ المقال') }
  );
}

export async function restorePost(body: Record<string, unknown>): Promise<HttpResult> {
  return withAuthenticatedUser(
    async ({ userId, userEmail, supabase }) => {
      const validated = RestorePostSnapshotSchema.safeParse(body);
      if (!validated.success) {
        return jsonResult(400, { error: 'بيانات استرجاع المقال غير صالحة' });
      }

      const { posts } = createBlogpressPostsModule(supabase);
      const { id } = await posts.restorePost(userId, validated.data, userEmail);

      return jsonResult(
        200,
        { success: true, id },
        {
          revalidate: postRevalidation(validated.data.slug),
          tags: BLOG_MUTATION_TAGS,
        }
      );
    },
    { mapError: messageError(500, 'فشل استرجاع المقال') }
  );
}

export async function publishPost(id: string): Promise<HttpResult> {
  return withAuthenticatedUser(
    async ({ userId, userEmail, supabase }) => {
      const { posts } = createBlogpressPostsModule(supabase);
      const { slug } = await posts.publishPost(id, userId, userEmail);

      return jsonResult(
        200,
        { success: true },
        { revalidate: publishRevalidation(slug), tags: BLOG_MUTATION_TAGS }
      );
    },
    { mapError: messageError(500, 'فشل نشر المقال') }
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
        { revalidate: publishRevalidation(slug), tags: BLOG_MUTATION_TAGS }
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
          tags: BLOG_MUTATION_TAGS,
        }
      );
    },
    { mapError: messageError(500, 'فشل جدولة المقال') }
  );
}

export async function setPostFeatured(id: string, featured: boolean): Promise<HttpResult> {
  return withAuthenticatedUser(
    async ({ userId, supabase }) => {
      const { repository } = createBlogpressPostsModule(supabase);
      await repository.setPostFeatured(id, userId, featured);
      return jsonResult(200, { success: true }, { revalidate: [{ path: '/blogpress' }] });
    },
    { mapError: messageError(500, 'فشل تحديث تثبيت المقال') }
  );
}

export async function bulkPostsAction(body: Record<string, unknown>): Promise<HttpResult> {
  return withAuthenticatedUser(
    async ({ userId, userEmail, supabase }) => {
      const validated = BulkPostsActionSchema.safeParse(body);
      if (!validated.success) {
        return jsonResult(400, { error: 'بيانات الإجراء غير صالحة' });
      }

      const { action, postIds, categoryId } = validated.data;
      const { posts, repository } = createBlogpressPostsModule(supabase);

      if (action === 'setCategory') {
        if (!categoryId) return jsonResult(400, { error: 'اختر تصنيفاً' });
        await repository.bulkSetPostCategories(postIds, userId, categoryId);
        return jsonResult(
          200,
          { success: true, affected: postIds.length },
          { revalidate: [{ path: '/blogpress' }], tags: BLOG_MUTATION_TAGS }
        );
      }

      const { affected, slugs } = await posts.bulkActionPosts(postIds, userId, action, userEmail);

      if (action === 'publish' || action === 'unpublish') {
        return jsonResult(
          200,
          { success: true, affected },
          {
            revalidate: slugs.flatMap((slug) => publishRevalidation(slug)),
            tags: BLOG_MUTATION_TAGS,
          }
        );
      }

      return jsonResult(
        200,
        { success: true, affected },
        { revalidate: slugs.flatMap((slug) => postRevalidation(slug)), tags: BLOG_MUTATION_TAGS }
      );
    },
    { mapError: messageError(500, 'فشل تنفيذ الإجراء على المقالات') }
  );
}

export async function saveAndPublishPost(
  id: string,
  body: Record<string, unknown>
): Promise<HttpResult> {
  return withAuthenticatedUser(
    async ({ userId, userEmail, supabase }) => {
      const validated = PostSchema.safeParse(body);

      if (!validated.success) {
        return jsonResult(200, { errors: validated.error.flatten().fieldErrors });
      }

      const { posts } = createBlogpressPostsModule(supabase);
      const { slug } = await posts.saveAndPublishPost(id, userId, validated.data, userEmail);

      return jsonResult(
        200,
        { success: true, slug },
        { revalidate: publishRevalidation(slug), tags: BLOG_MUTATION_TAGS }
      );
    },
    { mapError: messageError(500, 'فشل نشر المقال') }
  );
}

export async function uploadMedia(formData: FormData): Promise<HttpResult> {
  return withAuthenticatedUser(
    async ({ userId, supabase }) => {
      const result = await createBlogpressMediaService(supabase).uploadImage(formData, userId);
      return jsonResult(200, result);
    },
    { mapError: messageError(500, 'فشل رفع الصُّورة') }
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
      const tag = await repository.createTag(userId, validated.data.name, validated.data.slug);

      return jsonResult(200, { tag });
    },
    { mapError: messageError(500, 'فشل إنشاء الوسم') }
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
        { revalidate: [{ path: `/blogpress/editor/${id}` }], tags: BLOG_MUTATION_TAGS }
      );
    },
    { mapError: messageError(500, 'فشل تحديث وسوم المقال') }
  );
}
