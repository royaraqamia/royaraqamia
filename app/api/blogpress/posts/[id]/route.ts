import { NextRequest } from 'next/server';
import { toNextResponse } from '@/backend/transport/http-result';
import { deletePost, updatePost } from '@/backend/controllers/blogpress';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const result = await updatePost(id, body);
  return toNextResponse(result);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await deletePost(id);
  return toNextResponse(result);
}
