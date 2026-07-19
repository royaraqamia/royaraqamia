import { NextRequest, NextResponse } from 'next/server';
import { createHabitService } from '@/domains/habitflow/config/composition-root';
import { getOptionalUser, jsonOk, jsonError } from '@/domains/habitflow/shared/api-helpers';
import { AppError } from '@/domains/habitflow/shared/errors';

export async function GET(_req: NextRequest) {
  try {
    const { user, client } = await getOptionalUser();
    const { service, mode } = createHabitService(user?.id, client ?? undefined);
    const habits = await service.getAllHabits();
    return jsonOk({ habits, mode });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { user, client } = await getOptionalUser();
    const body = await req.json();
    const { service, mode } = createHabitService(user?.id, client ?? undefined);
    const habit = await service.createHabit(body);
    return NextResponse.json({ habit, mode }, { status: 201 });
  } catch (error) {
    if (error instanceof AppError || (error instanceof Error && error.message.includes('مطلوب'))) {
      return jsonError(error, 400);
    }
    return jsonError(error);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { user, client } = await getOptionalUser();
    const body = await req.json();
    const { id, ...data } = body;
    if (!id) {
      return jsonError(new AppError('Habit ID is required', 400), 400);
    }
    const { service, mode } = createHabitService(user?.id, client ?? undefined);
    const habit = await service.updateHabit(id, data);
    return jsonOk({ habit, mode });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { user, client } = await getOptionalUser();
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) {
      return jsonError(new AppError('Habit ID is required', 400), 400);
    }
    const { service, mode } = createHabitService(user?.id, client ?? undefined);
    const success = await service.deleteHabit(id);
    if (!success) {
      return jsonError(new AppError('Habit not found or could not be archived', 404), 404);
    }
    return jsonOk({ success, mode });
  } catch (error) {
    return jsonError(error);
  }
}
