import { NextRequest } from 'next/server';
import { toNextResponse } from '@/backend/transport/http-result';
import { parseBody } from '@/backend/transport/request-body';
import { createHabit, deleteHabit, getHabits, updateHabit } from '@/backend/controllers/habitflow';
import { HabitUpdateSchema, HabitWriteSchema } from '@/shared/contracts/habitflow';

export async function GET() {
  return toNextResponse(await getHabits());
}

export async function POST(req: NextRequest) {
  const parsed = parseBody(HabitWriteSchema, await req.json().catch(() => null));
  if (!parsed.ok) return toNextResponse(parsed.result);
  return toNextResponse(await createHabit(parsed.data));
}

export async function PUT(req: NextRequest) {
  const parsed = parseBody(HabitUpdateSchema, await req.json().catch(() => null));
  if (!parsed.ok) return toNextResponse(parsed.result);
  return toNextResponse(await updateHabit(parsed.data));
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const body = await req.json().catch(() => ({}));
  const updatedAt = typeof body.updatedAt === 'string' ? body.updatedAt : undefined;
  return toNextResponse(await deleteHabit(searchParams.get('id'), updatedAt));
}
