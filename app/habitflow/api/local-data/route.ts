import { NextRequest, NextResponse } from 'next/server';
import { getLocalHabitRepository } from '@/backend/config/habitflow';

export async function GET(_req: NextRequest) {
  const repository = getLocalHabitRepository();
  const { habits, logs } = await repository.getLocalData();
  return NextResponse.json({ habits, logs, count: habits.length });
}
