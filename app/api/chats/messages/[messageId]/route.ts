import { NextRequest } from 'next/server';

import { deleteChatMessage, editChatMessage } from '@/backend/controllers/chat';
import { toNextResponse } from '@/backend/transport/http-result';

/**
 * A message is addressed by its own id, not by its thread: the id is unique,
 * and the RLS policy is what decides whether the caller may touch it. Naming
 * the conversation in the path would only repeat a fact the row already holds.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ messageId: string }> }
) {
  const { messageId } = await params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  return toNextResponse(await editChatMessage(messageId, body, req.headers));
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ messageId: string }> }
) {
  const { messageId } = await params;
  return toNextResponse(await deleteChatMessage(messageId, req.headers));
}
