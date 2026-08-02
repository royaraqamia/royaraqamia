import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { getAuthUser } from '@/backend/middleware/auth-guard';
import { createSpendtrackService } from '@/backend/config/spendtrack';

export async function GET(req: NextRequest) {
  try {
    const { user, supabase } = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: 'غير مصرح' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const offset = Number(searchParams.get('offset') ?? 0);
    const limit = Number(searchParams.get('limit') ?? 20);
    const start = searchParams.get('start') ?? '';
    const end = searchParams.get('end') ?? '';
    const categories = (searchParams.get('categories') ?? '').split(',').filter(Boolean);
    const sort = searchParams.get('sort') ?? '';

    const { expenses } = await createSpendtrackService(supabase).getTransactions({
      userId: user.id,
      start,
      end,
      filterCategories: categories,
      sort,
      pageSize: limit,
      offset,
    });

    return NextResponse.json({ expenses });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'فشل تحميل المصروفات' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const { user, supabase } = await getAuthUser();
    if (!user) {
      return NextResponse.json({ error: 'غير مصرح' }, { status: 401 });
    }

    const { amount, category_id, date, description } = await req.json();

    try {
      await createSpendtrackService(supabase).createExpense(user.id, {
        amount,
        category_id,
        date,
        description: description ?? null,
      });
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'فشل إنشاء المصروف' },
        { status: 400 }
      );
    }

    revalidatePath('/spendtrack', 'layout');
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'فشل إنشاء المصروف' },
      { status: 500 }
    );
  }
}
