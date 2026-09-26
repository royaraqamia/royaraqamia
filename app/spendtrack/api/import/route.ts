import { NextRequest } from 'next/server';
import { toNextResponse } from '@/backend/transport/http-result';
import { importExpenses } from '@/backend/controllers/spendtrack';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const result = await importExpenses(body);
  return toNextResponse(result);
}
