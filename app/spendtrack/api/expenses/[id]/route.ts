import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { getAuthUser } from '@/backend/middleware/auth-guard';
import { createSpendtrackService } from '@/backend/config/spendtrack';

export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const { user, supabase } = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: 'غير مصرح' }, { status: 401 });
    }

    const { amount, category_id, date, description } = await req.json();

    try {
      await createSpendtrackService(supabase).updateExpense(id, user.id, {
        amount,
        category_id,
        date,
        description: description ?? null,
      });
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'فشل تحديث المصروف' },
        { status: 400 }
      );
    }

    revalidatePath('/spendtrack', 'layout');
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'فشل تحديث المصروف' },
      { status: 500 }
    );
  }
}

export async function DELETE(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const { user, supabase } = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: 'غير مصرح' }, { status: 401 });
    }

    try {
      await createSpendtrackService(supabase).deleteExpense(id, user.id);
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'فشل حذف المصروف' },
        { status: 400 }
      );
    }

    revalidatePath('/spendtrack', 'layout');
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'فشل حذف المصروف' },
      { status: 500 }
    );
  }
}
