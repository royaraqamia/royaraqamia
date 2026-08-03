import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/backend/transport/supabase/server';
import { createBlogpressPostsService } from '@/backend/config/blogpress';
import { AdminValidator } from '@/shared/admin-validator';
import { env } from '@/backend/config/env';

export async function POST(_req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'غير مصرح' }, { status: 401 });
    }

    const blogVisible = AdminValidator.isAdmin(user.email ?? '', env.adminEmails);

    const { slug } = await createBlogpressPostsService(supabase).publishPost(
      id,
      user.id,
      blogVisible
    );

    revalidatePath('/blogpress');
    revalidatePath(`/blog/${slug}`);
    revalidatePath('/blog');
    revalidatePath('/sitemap.xml');
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'فشل نشر المقال' },
      { status: 500 }
    );
  }
}
