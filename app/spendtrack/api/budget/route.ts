import { NextRequest } from 'next/server';
import { toNextResponse } from '@/backend/transport/http-result';
import { revalidateResultPaths } from '@/backend/transport/revalidate';
import { getBudget, setBudget, deleteBudget } from '@/backend/controllers/spendtrack';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const categoryId = searchParams.get('categoryId') ?? undefined;
  return toNextResponse(await getBudget(searchParams.get('month') ?? '', categoryId));
}

export async function PUT(req: NextRequest) {
  const body = await req.json();
  const result = await setBudget(body);
  revalidateResultPaths(result);
  return toNextResponse(result);
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const categoryId = searchParams.get('categoryId') ?? undefined;
  const result = await deleteBudget(searchParams.get('month') ?? '', categoryId);
  revalidateResultPaths(result);
  return toNextResponse(result);
}
