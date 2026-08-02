import { NextResponse } from 'next/server';
import { createClient } from '@/backend/transport/supabase/server';
import { createBlogpressPostsService } from '@/backend/config/blogpress';

export async function POST() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'غير مصرح' }, { status: 401 });
    }

    const { id } = await createBlogpressPostsService(supabase).createPost(user.id);
    return NextResponse.json({ id });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'فشل إنشاء المقال' },
      { status: 500 }
    );
  }
}
