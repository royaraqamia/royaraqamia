import { NextRequest } from 'next/server';
import { toNextResponse } from '@/backend/transport/http-result';
import { parseBody } from '@/backend/transport/request-body';
import { setHabitLogNote } from '@/backend/controllers/habitflow';
import { HabitLogNoteWriteSchema } from '@/shared/contracts/habitflow';

export async function POST(req: NextRequest) {
  const parsed = parseBody(HabitLogNoteWriteSchema, await req.json().catch(() => null));
  if (!parsed.ok) return toNextResponse(parsed.result);
  return toNextResponse(await setHabitLogNote(parsed.data));
}
