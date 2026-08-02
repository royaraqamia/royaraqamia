import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/backend/transport/supabase/server';
import { createBlogpressPostsService } from '@/backend/config/blogpress';
import { PostSchema } from '@/shared/contracts/blog';

export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
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

    const service = createBlogpressPostsService(supabase);
    try {
      await service.updatePost(id, user.id, validated.data);
    } catch (error) {
      return NextResponse.json(
        { message: error instanceof Error ? error.message : 'فشل حفظ المقال' },
        { status: 500 }
      );
    }

    revalidatePath('/blogpress');
    revalidatePath(`/blogpress/editor/${id}`);
    revalidatePath(`/blog/${validated.data.slug}`);
    revalidatePath('/blog');
    return NextResponse.json({ message: 'تمَّ حفظ المقال' });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'فشل حفظ المقال' },
      { status: 500 }
    );
  }
}

export async function DELETE(_req: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'غير مصرح' }, { status: 401 });
    }

    const { slug } = await createBlogpressPostsService(supabase).deletePost(id, user.id);

    revalidatePath('/blogpress');
    revalidatePath(`/blog/${slug}`);
    revalidatePath('/blog');
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'فشل حذف المقال' },
      { status: 500 }
    );
  }
}
