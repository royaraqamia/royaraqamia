import { NextRequest } from 'next/server';

import { rejectChatAgentAction } from '@/backend/controllers/chat';
import { toNextResponse } from '@/backend/transport/http-result';

/** Declining a proposal (ADR-0113, #818): the row becomes `rejected`, nothing runs. */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; actionId: string }> }
) {
  const { id, actionId } = await params;
  return toNextResponse(await rejectChatAgentAction(id, actionId, req.headers));
}
