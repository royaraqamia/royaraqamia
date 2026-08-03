import { NextRequest } from 'next/server';
import { toNextResponse } from '@/backend/transport/http-result';
import { revalidateResultPaths } from '@/backend/transport/revalidate';
import { deleteExpense, updateExpense } from '@/backend/controllers/spendtrack';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const result = await updateExpense(id, body);
  revalidateResultPaths(result);
  return toNextResponse(result);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await deleteExpense(id);
  revalidateResultPaths(result);
  return toNextResponse(result);
}
