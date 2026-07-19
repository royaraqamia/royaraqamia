import { NextRequest } from 'next/server';
import { createHabitService } from '@/domains/habitflow/config/composition-root';
import { getOptionalUser, jsonOk, jsonError } from '@/domains/habitflow/shared/api-helpers';
import { AppError } from '@/domains/habitflow/shared/errors';

export async function GET(req: NextRequest) {
  try {
    const { user, client } = await getOptionalUser();
    const { searchParams } = new URL(req.url);
    let startDate = searchParams.get('startDate');
    let endDate = searchParams.get('endDate');

    if (!startDate || !endDate) {
      const today = new Date();
      const past = new Date();
      past.setDate(past.getDate() - 35);
      startDate = startDate || past.toISOString().split('T')[0]!;
      endDate = endDate || today.toISOString().split('T')[0]!;
    }

    const { service, mode } = createHabitService(user?.id, client ?? undefined);
    const logs = await service.getLogs(startDate, endDate);
    return jsonOk({ logs, mode });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { user, client } = await getOptionalUser();
    const body = await req.json();
    const { habitId, date, completed } = body;

    if (!habitId) {
      return jsonError(new AppError('Habit ID is required', 400), 400);
    }
    if (!date) {
      return jsonError(new AppError('Date is required (YYYY-MM-DD)', 400), 400);
    }
    if (completed === undefined) {
      return jsonError(new AppError('Completed status is required', 400), 400);
    }

    const { service, mode } = createHabitService(user?.id, client ?? undefined);
    const log = await service.toggleHabitLog({ habitId, date, completed });

    return jsonOk({ log, mode });
  } catch (error) {
    return jsonError(error);
  }
}
