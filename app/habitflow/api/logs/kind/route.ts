import { NextRequest } from 'next/server';
import { toNextResponse } from '@/backend/transport/http-result';
import { parseBody } from '@/backend/transport/request-body';
import { setHabitLogKind } from '@/backend/controllers/habitflow';
import { HabitLogKindWriteSchema } from '@/shared/contracts/habitflow';

export async function POST(req: NextRequest) {
  const parsed = parseBody(HabitLogKindWriteSchema, await req.json().catch(() => null));
  if (!parsed.ok) return toNextResponse(parsed.result);
  return toNextResponse(await setHabitLogKind(parsed.data));
}
