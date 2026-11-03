import { NextRequest } from 'next/server';

import { confirmChatAgentAction } from '@/backend/controllers/chat';
import { toNextResponse } from '@/backend/transport/http-result';

/**
 * The member's confirmation of one proposal (ADR-0113, #818).
 *
 * Two ids, because the row belongs to a thread: `id` is the conversation the
 * caller opened and `actionId` the proposal in it, and RLS answers a pair that
 * does not belong together as not found. The write itself runs as the caller.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; actionId: string }> }
) {
  const { id, actionId } = await params;
  return toNextResponse(await confirmChatAgentAction(id, actionId, req.headers));
}
