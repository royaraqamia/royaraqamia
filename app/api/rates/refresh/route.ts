import { NextRequest } from 'next/server';
import { toNextResponse } from '@/backend/transport/http-result';
import { refreshRates } from '@/backend/controllers/rates';

export async function GET(req: NextRequest) {
  return toNextResponse(await refreshRates(req.headers));
}
