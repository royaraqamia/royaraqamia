import { NextRequest } from 'next/server';
import { toNextResponse } from '@/backend/transport/http-result';
import { getRateSeries } from '@/backend/controllers/rates';

export async function GET(req: NextRequest) {
  return toNextResponse(await getRateSeries(new URL(req.url).searchParams));
}
