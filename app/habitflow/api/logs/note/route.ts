import { NextRequest } from 'next/server';
import { toNextResponse } from '@/backend/transport/http-result';
import { setHabitLogNote } from '@/backend/controllers/habitflow';

export async function POST(req: NextRequest) {
  const body = await req.json();
  return toNextResponse(await setHabitLogNote(body));
}
