import { getAuthUser } from '@/backend/middleware/auth-guard';
import {
  createBlogpressMediaService,
  createBlogpressPostsService,
} from '@/backend/config/blogpress';
import { PostSchema, TagInputSchema, PostTagIdsSchema } from '@/shared/contracts/blog';
import { jsonResult, type HttpResult } from '@/backend/transport/http-result';
import type { RevalidationHint } from '@/backend/transport/http-result';

function postRevalidation(slug: string): RevalidationHint[] {
  return [{ path: '/blogpress' }, { path: `/blog/${slug}` }, { path: '/blog' }];
}

function publishRevalidation(slug: string): RevalidationHint[] {
  return [...postRevalidation(slug), { path: '/sitemap.xml' }];
}

export async function createPost(): Promise<HttpResult> {
  try {
    const { user, supabase } = await getAuthUser();
    if (!user) return jsonResult(401, { error: 'غير مصرح' });

    const { id } = await createBlogpressPostsService(supabase).createPost(user.id);
    return jsonResult(200, { id });
  } catch (error) {
    return jsonResult(500, {
      error: error instanceof Error ? error.message : 'فشل إنشاء المقال',
    });
  }
}

export async function updatePost(id: string, body: Record<string, unknown>): Promise<HttpResult> {
  try {
    const { user, supabase } = await getAuthUser();
    if (!user) return jsonResult(401, { error: 'غير مصرح' });

    const validated = PostSchema.safeParse(body);

    if (!validated.success) {
      return jsonResult(200, { errors: validated.error.flatten().fieldErrors });
    }

    const service = createBlogpressPostsService(supabase);
    try {
      await service.updatePost(id, user.id, validated.data);
    } catch (error) {
      return jsonResult(500, {
        message: error instanceof Error ? error.message : 'فشل حفظ المقال',
      });
    }

    return jsonResult(
      200,
      { message: 'تمَّ حفظ المقال' },
      {
        revalidate: [...postRevalidation(validated.data.slug), { path: `/blogpress/editor/${id}` }],
      }
    );
  } catch (error) {
    return jsonResult(500, {
      error: error instanceof Error ? error.message : 'فشل حفظ المقال',
    });
  }
}

export async function deletePost(id: string): Promise<HttpResult> {
  try {
    const { user, supabase } = await getAuthUser();
    if (!user) return jsonResult(401, { error: 'غير مصرح' });

    const { slug } = await createBlogpressPostsService(supabase).deletePost(id, user.id);

    return jsonResult(200, { success: true }, { revalidate: postRevalidation(slug) });
  } catch (error) {
    return jsonResult(500, {
      error: error instanceof Error ? error.message : 'فشل حذف المقال',
    });
  }
}

export async function publishPost(id: string): Promise<HttpResult> {
  try {
    const { user, supabase } = await getAuthUser();
    if (!user) return jsonResult(401, { error: 'غير مصرح' });

    const { slug } = await createBlogpressPostsService(supabase).publishPost(
      id,
      user.id,
      user.email ?? ''
    );

    return jsonResult(200, { success: true }, { revalidate: publishRevalidation(slug) });
  } catch (error) {
    return jsonResult(500, {
      error: error instanceof Error ? error.message : 'فشل نشر المقال',
    });
  }
}

export async function unpublishPost(id: string): Promise<HttpResult> {
  try {
    const { user, supabase } = await getAuthUser();
    if (!user) return jsonResult(401, { error: 'غير مصرح' });

    const { slug } = await createBlogpressPostsService(supabase).unpublishPost(id, user.id);

    return jsonResult(200, { success: true }, { revalidate: publishRevalidation(slug) });
  } catch (error) {
    return jsonResult(500, {
      error: error instanceof Error ? error.message : 'فشل إلغاء النَّشر',
    });
  }
}

export async function setPostFeatured(id: string, featured: boolean): Promise<HttpResult> {
  try {
    const { user, supabase } = await getAuthUser();
    if (!user) return jsonResult(401, { error: 'غير مصرح' });

    await createBlogpressPostsService(supabase).setPostFeatured(id, user.id, featured);

    return jsonResult(200, { success: true }, { revalidate: [{ path: '/blogpress' }] });
  } catch (error) {
    return jsonResult(500, {
      error: error instanceof Error ? error.message : 'فشل تحديث تثبيت المقال',
    });
  }
}

export async function saveAndPublishPost(
  id: string,
  body: Record<string, unknown>
): Promise<HttpResult> {
  try {
    const { user, supabase } = await getAuthUser();
    if (!user) return jsonResult(401, { error: 'غير مصرح' });

    const validated = PostSchema.safeParse(body);

    if (!validated.success) {
      return jsonResult(200, { errors: validated.error.flatten().fieldErrors });
    }

    const { slug } = await createBlogpressPostsService(supabase).saveAndPublishPost(
      id,
      user.id,
      validated.data,
      user.email ?? ''
    );

    return jsonResult(200, { success: true, slug }, { revalidate: publishRevalidation(slug) });
  } catch (error) {
    return jsonResult(500, {
      error: error instanceof Error ? error.message : 'فشل نشر المقال',
    });
  }
}

export async function uploadMedia(formData: FormData): Promise<HttpResult> {
  try {
    const { user, supabase } = await getAuthUser();
    if (!user) return jsonResult(401, { error: 'غير مصرح' });

    const result = await createBlogpressMediaService(supabase).uploadImage(formData, user.id);

    return jsonResult(200, result);
  } catch (error) {
    return jsonResult(500, {
      error: error instanceof Error ? error.message : 'فشل رفع الصُّورة',
    });
  }
}

export async function listBlogTags(): Promise<HttpResult> {
  try {
    const { user, supabase } = await getAuthUser();
    if (!user) return jsonResult(401, { error: 'غير مصرح' });

    const tags = await createBlogpressPostsService(supabase).listTagsByAuthor(user.id);
    return jsonResult(200, { tags });
  } catch (error) {
    return jsonResult(500, {
      error: error instanceof Error ? error.message : 'فشل جلب الوسوم',
    });
  }
}

export async function createBlogTag(body: Record<string, unknown>): Promise<HttpResult> {
  try {
    const { user, supabase } = await getAuthUser();
    if (!user) return jsonResult(401, { error: 'غير مصرح' });

    const validated = TagInputSchema.safeParse(body);
    if (!validated.success) {
      return jsonResult(200, { errors: validated.error.flatten().fieldErrors });
    }

    const tag = await createBlogpressPostsService(supabase).createTag(
      user.id,
      validated.data.name,
      validated.data.slug
    );

    return jsonResult(200, { tag });
  } catch (error) {
    return jsonResult(500, {
      error: error instanceof Error ? error.message : 'فشل إنشاء الوسم',
    });
  }
}

export async function deleteBlogTag(id: string): Promise<HttpResult> {
  try {
    const { user, supabase } = await getAuthUser();
    if (!user) return jsonResult(401, { error: 'غير مصرح' });

    await createBlogpressPostsService(supabase).deleteTag(id, user.id);

    return jsonResult(200, { success: true });
  } catch (error) {
    return jsonResult(500, {
      error: error instanceof Error ? error.message : 'فشل حذف الوسم',
    });
  }
}

export async function setBlogPostTags(
  id: string,
  body: Record<string, unknown>
): Promise<HttpResult> {
  try {
    const { user, supabase } = await getAuthUser();
    if (!user) return jsonResult(401, { error: 'غير مصرح' });

    const validated = PostTagIdsSchema.safeParse(body);
    if (!validated.success) {
      return jsonResult(200, { errors: validated.error.flatten().fieldErrors });
    }

    await createBlogpressPostsService(supabase).setPostTags(id, user.id, validated.data.tagIds);

    return jsonResult(
      200,
      { success: true },
      { revalidate: [{ path: `/blogpress/editor/${id}` }] }
    );
  } catch (error) {
    return jsonResult(500, {
      error: error instanceof Error ? error.message : 'فشل تحديث وسوم المقال',
    });
  }
}
