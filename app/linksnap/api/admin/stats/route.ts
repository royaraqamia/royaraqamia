import { NextRequest } from 'next/server';
import { toNextResponse } from '@/backend/transport/http-result';
import { getSystemStats } from '@/backend/controllers/linksnap';

export async function GET(req: NextRequest) {
  return toNextResponse(await getSystemStats(req.headers.get('Authorization')));
}
