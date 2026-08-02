import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/backend/transport/supabase/server';
import { createBlogpressPostsService } from '@/backend/config/blogpress';

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

    const { slug } = await createBlogpressPostsService(supabase).unpublishPost(id, user.id);

    revalidatePath('/blogpress');
    revalidatePath(`/blog/${slug}`);
    revalidatePath('/blog');
    revalidatePath('/sitemap.xml');
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'فشل إلغاء النَّشر' },
      { status: 500 }
    );
  }
}
