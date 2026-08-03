import { NextRequest } from 'next/server';
import { toNextResponse } from '@/backend/transport/http-result';
import { getLogs, toggleLog } from '@/backend/controllers/habitflow';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  return toNextResponse(await getLogs(searchParams.get('startDate'), searchParams.get('endDate')));
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  return toNextResponse(await toggleLog(body));
}
