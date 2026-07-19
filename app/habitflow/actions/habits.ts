'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createHabitService } from '@/domains/habitflow/config/composition-root';
import {
  createHabitSchema,
  updateHabitSchema,
  toggleLogSchema,
} from '@/domains/habitflow/lib/validation';
import type { Habit, HabitLog } from '@/domains/habitflow/models';

type ActionResult<T = void> = { error: string } | ({ success: true } & T);

type CreateHabitResult = ActionResult<{ habit: Habit; mode: 'supabase' | 'local' }>;
type UpdateHabitResult = ActionResult<{ habit: Habit; mode: 'supabase' | 'local' }>;
type ArchiveHabitResult = ActionResult<{ success: true; mode: 'supabase' | 'local' }>;
type ToggleLogResult = ActionResult<{ log: HabitLog; mode: 'supabase' | 'local' }>;

export async function fetchUser() {
  const supabase = await createClient();
  if (!supabase) return { user: null, client: null };
  const { data } = await supabase.auth.getUser();
  return { user: data?.user ?? null, client: supabase };
}

export async function fetchInitialData() {
  try {
    const { user, client } = await fetchUser();
    const { service, mode } = createHabitService(user?.id, client ?? undefined);
    const habits = await service.getAllHabits();
    const logs = await service.getLogs(
      new Date(Date.now() - 35 * 86400000).toISOString().slice(0, 10),
      new Date().toISOString().slice(0, 10)
    );
    return { habits, logs, mode, user };
  } catch (e) {
    console.error('fetchInitialData error:', e);
    return { habits: [], logs: [], mode: 'local' as const, user: null };
  }
}

export async function createHabit(formData: FormData): Promise<CreateHabitResult> {
  try {
    const { user, client } = await fetchUser();
    const parsed = createHabitSchema.safeParse({
      name: formData.get('name'),
      icon: formData.get('icon') || undefined,
      frequency: formData.get('frequency') || undefined,
    });

    if (!parsed.success) {
      const firstError = parsed.error.issues[0]?.message || 'بيانات غير صالحة';
      return { error: firstError };
    }

    const { service, mode } = createHabitService(user?.id, client ?? undefined);
    const habit = await service.createHabit(parsed.data);

    revalidatePath('/habitflow');
    return { habit, mode, success: true };
  } catch (e) {
    console.error('createHabit error:', e);
    const message = e instanceof Error ? e.message : 'حدث خطأ أثناء إنشاء العادة';
    return { error: message };
  }
}

export async function updateHabit(formData: FormData): Promise<UpdateHabitResult> {
  try {
    const { user, client } = await fetchUser();
    const parsed = updateHabitSchema.safeParse({
      id: formData.get('id'),
      name: formData.get('name'),
      icon: formData.get('icon') || undefined,
      frequency: formData.get('frequency') || undefined,
    });

    if (!parsed.success) {
      const firstError = parsed.error.issues[0]?.message || 'بيانات غير صالحة';
      return { error: firstError };
    }

    const { service, mode } = createHabitService(user?.id, client ?? undefined);
    const habit = await service.updateHabit(parsed.data.id, parsed.data);

    revalidatePath('/habitflow');
    return { habit, mode, success: true };
  } catch (e) {
    console.error('updateHabit error:', e);
    return { error: 'حدث خطأ أثناء تحديث العادة. يرجى المحاولة مرة أخرى.' };
  }
}

export async function archiveHabit(habitId: string): Promise<ArchiveHabitResult> {
  try {
    const { user, client } = await fetchUser();

    const { service, mode } = createHabitService(user?.id, client ?? undefined);
    const success = await service.deleteHabit(habitId);

    if (!success) {
      return { error: 'فشل في أرشفة العادة. يرجى المحاولة مرة أخرى.' };
    }

    revalidatePath('/habitflow');
    return { success: true, mode };
  } catch (e) {
    console.error('archiveHabit error:', e);
    return { error: 'حدث خطأ أثناء أرشفة العادة. يرجى المحاولة مرة أخرى.' };
  }
}

export async function toggleLog(
  habitId: string,
  date: string,
  completed: boolean
): Promise<ToggleLogResult> {
  try {
    const { user, client } = await fetchUser();
    const parsed = toggleLogSchema.safeParse({ habitId, date, completed });

    if (!parsed.success) {
      const firstError = parsed.error.issues[0]?.message || 'بيانات غير صالحة';
      return { error: firstError };
    }

    const { service, mode } = createHabitService(user?.id, client ?? undefined);
    const log = await service.toggleHabitLog(parsed.data);

    revalidatePath('/habitflow');
    return { log, mode, success: true };
  } catch (e) {
    console.error('toggleLog error:', e);
    return { error: 'حدث خطأ أثناء تسجيل العادة. يرجى المحاولة مرة أخرى.' };
  }
}
