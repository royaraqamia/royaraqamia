import { NextRequest } from 'next/server';
import { toNextResponse } from '@/backend/transport/http-result';
import { revalidateResultPaths } from '@/backend/transport/revalidate';
import { deletePost, updatePost } from '@/backend/controllers/blogpress';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const result = await updatePost(id, body);
  revalidateResultPaths(result);
  return toNextResponse(result);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await deletePost(id);
  revalidateResultPaths(result);
  return toNextResponse(result);
}
