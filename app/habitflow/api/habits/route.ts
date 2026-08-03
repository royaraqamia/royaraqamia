import { NextRequest } from 'next/server';
import { toNextResponse } from '@/backend/transport/http-result';
import { createHabit, deleteHabit, getHabits, updateHabit } from '@/backend/controllers/habitflow';

export async function GET() {
  return toNextResponse(await getHabits());
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  return toNextResponse(await createHabit(body));
}

export async function PUT(req: NextRequest) {
  const body = await req.json();
  return toNextResponse(await updateHabit(body));
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  return toNextResponse(await deleteHabit(searchParams.get('id')));
}
