import { NextRequest } from 'next/server';

import { getChatAssistant, startChatAssistant } from '@/backend/controllers/chat';
import { toNextResponse } from '@/backend/transport/http-result';

/**
 * The assistant thread: created on first open, and the composer's state.
 *
 * `POST` is idempotent — one thread per member — so opening the assistant twice
 * answers the same conversation. `GET` says whether a provider key is configured
 * and how much of today's allowance is left; neither is an error when the answer
 * is "off" or "spent".
 */
export async function GET() {
  return toNextResponse(await getChatAssistant());
}

export async function POST(req: NextRequest) {
  return toNextResponse(await startChatAssistant(req.headers));
}
