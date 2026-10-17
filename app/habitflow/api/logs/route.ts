import { NextRequest } from 'next/server';
import { toNextResponse } from '@/backend/transport/http-result';
import { parseBody } from '@/backend/transport/request-body';
import { getLogs, toggleLog } from '@/backend/controllers/habitflow';
import { HabitLogWriteSchema } from '@/shared/contracts/habitflow';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  return toNextResponse(await getLogs(searchParams.get('startDate'), searchParams.get('endDate')));
}

export async function POST(req: NextRequest) {
  const parsed = parseBody(HabitLogWriteSchema, await req.json().catch(() => null));
  if (!parsed.ok) return toNextResponse(parsed.result);
  return toNextResponse(await toggleLog(parsed.data));
}
