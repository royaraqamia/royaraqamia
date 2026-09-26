import { NextRequest } from 'next/server';
import { toNextResponse } from '@/backend/transport/http-result';
import { getCurrency, updateCurrency } from '@/backend/controllers/spendtrack';

export async function GET() {
  return toNextResponse(await getCurrency());
}

export async function PUT(req: NextRequest) {
  const body = await req.json();
  const result = await updateCurrency(body);
  return toNextResponse(result);
}
