import { NextRequest } from 'next/server';
import { toNextResponse } from '@/backend/transport/http-result';
import { deletePost, updatePost } from '@/backend/controllers/blogpress';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const result = await updatePost(id, body);
  return toNextResponse(result);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // An Outbox replay carries the logical delete time; an online delete sends
  // nothing and the delete is stamped with the server clock.
  const body = await req.json().catch(() => null);
  const result = await deletePost(id, body);
  return toNextResponse(result);
}
