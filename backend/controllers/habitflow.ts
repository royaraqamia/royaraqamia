import { getOptionalUser } from '@/backend/middleware/auth-guard';
import {
  createHabitBackupService,
  createHabitService,
  createLocalHabitService,
} from '@/backend/config/habitflow';
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
    return errorResult(error);
  }
}

export async function updateHabit(body: Record<string, unknown>): Promise<HttpResult> {
  try {
    const { user, client } = await getOptionalUser();
    const { id, ...data } = body;
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
    const { service, mode } = createHabitService(user?.id, client ?? undefined);
    const success = await service.deleteHabit(id ?? '');
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
    const { service, mode } = createHabitService(user?.id, client ?? undefined);
    const logs = await service.getLogs(startDate ?? '', endDate ?? '');
    return jsonResult(200, { logs, mode });
  } catch (error) {
    return errorResult(error);
  }
}

export async function toggleLog(body: Record<string, unknown>): Promise<HttpResult> {
  try {
    const { user, client } = await getOptionalUser();
    const { habitId, date, completed } = body;
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

export async function setHabitLogKind(body: Record<string, unknown>): Promise<HttpResult> {
  try {
    const { user, client } = await getOptionalUser();
    const { habitId, date, kind } = body;
    const { service, mode } = createHabitService(user?.id, client ?? undefined);
    const log = await service.setHabitLogKind({
      habitId: habitId as string,
      date: date as string,
      kind: kind as 'complete' | 'skip' | 'miss' | 'none',
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
  const data = await createLocalHabitService().getLocalData();
  return jsonResult(200, data);
}

export async function getAuthUserInfo(): Promise<HttpResult> {
  const { user } = await getOptionalUser();
  return jsonResult(200, { user });
}
