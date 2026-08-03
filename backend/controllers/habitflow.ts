import { getOptionalUser } from '@/backend/middleware/auth-guard';
import {
  createHabitBackupService,
  createHabitService,
  getLocalHabitRepository,
} from '@/backend/config/habitflow';
import { AppError } from '@/backend/shared/habitflow/errors';
import { errorResult } from '@/backend/middleware/http';
import { jsonResult, type HttpResult } from '@/backend/transport/http-result';
import type { Habit, HabitRestoreInput } from '@/shared/contracts/habitflow';

export async function getHabits(): Promise<HttpResult> {
  try {
    const { user, client } = await getOptionalUser();
    const { service, mode } = createHabitService(user?.id, client ?? undefined);
    const habits = await service.getAllHabits();
    return jsonResult(200, { habits, mode });
  } catch (error) {
    return errorResult(error);
  }
}

export async function createHabit(body: Partial<Habit>): Promise<HttpResult> {
  try {
    const { user, client } = await getOptionalUser();
    const { service, mode } = createHabitService(user?.id, client ?? undefined);
    const habit = await service.createHabit(body);
    return jsonResult(201, { habit, mode });
  } catch (error) {
    if (error instanceof AppError || (error instanceof Error && error.message.includes('مطلوب'))) {
      return errorResult(error, 400);
    }
    return errorResult(error);
  }
}

export async function updateHabit(body: Record<string, unknown>): Promise<HttpResult> {
  try {
    const { user, client } = await getOptionalUser();
    const { id, ...data } = body;
    if (!id) {
      return errorResult(new AppError('Habit ID is required', 400), 400);
    }
    const { service, mode } = createHabitService(user?.id, client ?? undefined);
    const habit = await service.updateHabit(id as string, data as Partial<Habit>);
    return jsonResult(200, { habit, mode });
  } catch (error) {
    return errorResult(error);
  }
}

export async function deleteHabit(id: string | null): Promise<HttpResult> {
  try {
    const { user, client } = await getOptionalUser();
    if (!id) {
      return errorResult(new AppError('Habit ID is required', 400), 400);
    }
    const { service, mode } = createHabitService(user?.id, client ?? undefined);
    const success = await service.deleteHabit(id);
    if (!success) {
      return errorResult(new AppError('Habit not found or could not be archived', 404), 404);
    }
    return jsonResult(200, { success, mode });
  } catch (error) {
    return errorResult(error);
  }
}

export async function getLogs(
  startDate: string | null,
  endDate: string | null
): Promise<HttpResult> {
  try {
    const { user, client } = await getOptionalUser();
    let start = startDate;
    let end = endDate;

    if (!start || !end) {
      const today = new Date();
      const past = new Date();
      past.setDate(past.getDate() - 35);
      start = start || past.toISOString().split('T')[0]!;
      end = end || today.toISOString().split('T')[0]!;
    }

    const { service, mode } = createHabitService(user?.id, client ?? undefined);
    const logs = await service.getLogs(start, end);
    return jsonResult(200, { logs, mode });
  } catch (error) {
    return errorResult(error);
  }
}

export async function toggleLog(body: Record<string, unknown>): Promise<HttpResult> {
  try {
    const { user, client } = await getOptionalUser();
    const { habitId, date, completed } = body;

    if (!habitId) {
      return errorResult(new AppError('Habit ID is required', 400), 400);
    }
    if (!date) {
      return errorResult(new AppError('Date is required (YYYY-MM-DD)', 400), 400);
    }
    if (completed === undefined) {
      return errorResult(new AppError('Completed status is required', 400), 400);
    }

    const { service, mode } = createHabitService(user?.id, client ?? undefined);
    const log = await service.toggleHabitLog({
      habitId: habitId as string,
      date: date as string,
      completed: completed as boolean,
    });

    return jsonResult(200, { log, mode });
  } catch (error) {
    return errorResult(error);
  }
}

export async function exportBackup(): Promise<HttpResult> {
  try {
    const { user, client } = await getOptionalUser();
    const { service } = createHabitBackupService(user?.id, client ?? undefined);
    const backup = await service.exportBackup();
    return jsonResult(200, backup);
  } catch (error) {
    return errorResult(error);
  }
}

export async function restoreBackup(body: HabitRestoreInput): Promise<HttpResult> {
  try {
    const { user, client } = await getOptionalUser();
    const { service, mode } = createHabitBackupService(user?.id, client ?? undefined);
    await service.restoreBackup({ habits: body.habits, logs: body.logs });
    return jsonResult(200, { success: true, mode });
  } catch (error) {
    return errorResult(error);
  }
}

export async function getLocalData(): Promise<HttpResult> {
  const repository = getLocalHabitRepository();
  const { habits, logs } = await repository.getLocalData();
  return jsonResult(200, { habits, logs, count: habits.length });
}

export async function getAuthUserInfo(): Promise<HttpResult> {
  const { user } = await getOptionalUser();
  return jsonResult(200, { user });
}
