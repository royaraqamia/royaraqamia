import { NextRequest } from 'next/server';
import { toNextResponse } from '@/backend/transport/http-result';
import { deleteCategory, updateCategory } from '@/backend/controllers/spendtrack';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const result = await updateCategory(id, body);
  return toNextResponse(result);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await deleteCategory(id);
  return toNextResponse(result);
}
