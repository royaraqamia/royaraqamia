'use server';

import { createClient } from '@/backend/transport/supabase/server';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { createSpendtrackService } from '@/backend/config/spendtrack';

type ActionState = { error?: string; success?: boolean } | undefined;

export async function createCategory(_prevState: ActionState, formData: FormData) {
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'غير مصرح' };

  const name = String(formData.get('name') ?? '').trim();
  const color_hex = String(formData.get('color_hex') ?? '').trim();

  try {
    await createSpendtrackService(supabase).createCategory(user.id, { name, color_hex });
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'فشل إنشاء التصنيف' };
  }

  revalidatePath('/spendtrack/categories', 'layout');
  revalidatePath('/spendtrack', 'layout');
  return { success: true };
}

export async function updateCategory(
  categoryId: string,
  _prevState: ActionState,
  formData: FormData
) {
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'غير مصرح' };

  const name = String(formData.get('name') ?? '').trim();
  const color_hex = String(formData.get('color_hex') ?? '').trim();

  try {
    await createSpendtrackService(supabase).updateCategory(categoryId, user.id, {
      name,
      color_hex,
    });
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'فشل تحديث التصنيف' };
  }

  revalidatePath('/spendtrack/categories', 'layout');
  revalidatePath('/spendtrack', 'layout');
  return { success: true };
}

export async function deleteCategory(categoryId: string, _prevState: ActionState) {
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'غير مصرح' };

  try {
    await createSpendtrackService(supabase).deleteCategory(categoryId, user.id);
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'فشل حذف التصنيف' };
  }

  revalidatePath('/spendtrack/categories', 'layout');
  revalidatePath('/spendtrack', 'layout');
  return { success: true };
}
