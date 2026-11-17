import type { NextRequest } from 'next/server';
import { editPostComment, removePostComment } from '@/backend/controllers/community';
import { toNextResponse } from '@/backend/transport/http-result';

/** Edit one comment the caller wrote (#1573). */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  return toNextResponse(await editPostComment(id, body));
}

/** Tombstone one comment the caller wrote, and answer the new count (#1573). */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return toNextResponse(await removePostComment(id));
}
