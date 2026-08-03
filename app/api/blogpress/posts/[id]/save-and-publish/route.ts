import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/backend/transport/supabase/server';
import { createBlogpressPostsService } from '@/backend/config/blogpress';
import { PostSchema } from '@/shared/contracts/blog';

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'غير مصرح' }, { status: 401 });
    }

    const body = await req.json();
    const validated = PostSchema.safeParse(body);

    if (!validated.success) {
      return NextResponse.json({ errors: validated.error.flatten().fieldErrors });
    }

    const { slug } = await createBlogpressPostsService(supabase).saveAndPublishPost(
      id,
      user.id,
      validated.data,
      user.email ?? ''
    );

    revalidatePath('/blogpress');
    revalidatePath(`/blog/${slug}`);
    revalidatePath('/blog');
    revalidatePath('/sitemap.xml');
    return NextResponse.json({ success: true, slug });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'فشل نشر المقال' },
      { status: 500 }
    );
  }
}
