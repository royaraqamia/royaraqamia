import { NextRequest } from 'next/server';

import { forgetConversationMemory } from '@/backend/controllers/account-memory';
import { toNextResponse } from '@/backend/transport/http-result';

/**
 * `DELETE /api/chats/[id]/memory`: "forget this conversation" (ADR-0182
 * decision 6, #1428). It forgets the thread-scoped facts of this conversation
 * and their embeddings; the thread, its messages and its summary are untouched.
 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return toNextResponse(await forgetConversationMemory(id, req.headers));
}
