import { NextResponse } from 'next/server';
import { createClient } from '@/backend/transport/supabase/server';
import { createBlogpressMediaService } from '@/backend/config/blogpress';

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'غير مصرح' }, { status: 401 });
    }

    const formData = await req.formData();
    const result = await createBlogpressMediaService(supabase).uploadImage(formData, user.id);

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'فشل رفع الصُّورة' },
      { status: 500 }
    );
  }
}
