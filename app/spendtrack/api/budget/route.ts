import { NextRequest } from 'next/server';
import { toNextResponse } from '@/backend/transport/http-result';
import { revalidateResultPaths } from '@/backend/transport/revalidate';
import { getBudget, setBudget } from '@/backend/controllers/spendtrack';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  return toNextResponse(await getBudget(searchParams.get('month') ?? ''));
}

export async function PUT(req: NextRequest) {
  const body = await req.json();
  const result = await setBudget(body);
  revalidateResultPaths(result);
  return toNextResponse(result);
}
