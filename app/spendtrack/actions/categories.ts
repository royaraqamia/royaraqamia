'use server';

import { createClient } from '@/lib/supabase/server';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';

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

  if (!name || name.length > 50) return { error: 'الاسم مطلوب ويجب أن يكون أقل من 50 حرفًا' };
  if (!/^#[0-9a-fA-F]{6}$/.test(color_hex)) return { error: 'اللون غير صالح' };

  const { error } = await supabase.from('categories').insert({
    name,
    color_hex,
    user_id: user.id,
  });

  if (error) return { error: error.message };
  revalidatePath('/spendtrack/dashboard/categories');
  revalidatePath('/spendtrack/dashboard');
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

  if (!name || name.length > 50) return { error: 'الاسم مطلوب ويجب أن يكون أقل من 50 حرفًا' };
  if (!/^#[0-9a-fA-F]{6}$/.test(color_hex)) return { error: 'اللون غير صالح' };

  const { error } = await supabase
    .from('categories')
    .update({ name, color_hex })
    .eq('id', categoryId)
    .eq('user_id', user.id);

  if (error) return { error: error.message };
  revalidatePath('/spendtrack/dashboard/categories');
  revalidatePath('/spendtrack/dashboard');
  return { success: true };
}

export async function deleteCategory(categoryId: string, _prevState: ActionState) {
  const cookieStore = await cookies();
  const supabase = await createClient(cookieStore);

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: 'غير مصرح' };

  const { error } = await supabase
    .from('categories')
    .delete()
    .eq('id', categoryId)
    .eq('user_id', user.id);

  if (error) return { error: error.message };
  revalidatePath('/spendtrack/dashboard/categories');
  revalidatePath('/spendtrack/dashboard');
  return { success: true };
}
