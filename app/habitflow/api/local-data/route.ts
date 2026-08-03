import { NextRequest } from 'next/server';
import { toNextResponse } from '@/backend/transport/http-result';
import { getLocalData } from '@/backend/controllers/habitflow';

export async function GET(_req: NextRequest) {
  return toNextResponse(await getLocalData());
}
