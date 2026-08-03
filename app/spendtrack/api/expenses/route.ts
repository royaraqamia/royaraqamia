import { NextRequest } from 'next/server';
import { toNextResponse } from '@/backend/transport/http-result';
import { revalidateResultPaths } from '@/backend/transport/revalidate';
import { createExpense, getExpenses } from '@/backend/controllers/spendtrack';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  return toNextResponse(await getExpenses(searchParams));
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const result = await createExpense(body);
  revalidateResultPaths(result);
  return toNextResponse(result);
}
