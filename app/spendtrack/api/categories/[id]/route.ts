import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/backend/transport/supabase/server';
import { createSpendtrackService } from '@/backend/config/spendtrack';

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
    const name = String(body.name ?? '').trim();
    const color_hex = String(body.color_hex ?? '').trim();

    try {
      await createSpendtrackService(supabase).updateCategory(id, user.id, { name, color_hex });
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'فشل تحديث التصنيف' },
        { status: 500 }
      );
    }

    revalidatePath('/spendtrack/categories', 'layout');
    revalidatePath('/spendtrack', 'layout');
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'فشل تحديث التصنيف' },
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

    try {
      await createSpendtrackService(supabase).deleteCategory(id, user.id);
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'فشل حذف التصنيف' },
        { status: 500 }
      );
    }

    revalidatePath('/spendtrack/categories', 'layout');
    revalidatePath('/spendtrack', 'layout');
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'فشل حذف التصنيف' },
      { status: 500 }
    );
  }
}
