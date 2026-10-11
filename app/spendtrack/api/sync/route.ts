import { NextRequest } from 'next/server';
import { toNextResponse } from '@/backend/transport/http-result';
import { syncSpendtrack } from '@/backend/controllers/spendtrack';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  return toNextResponse(await syncSpendtrack(searchParams));
}
