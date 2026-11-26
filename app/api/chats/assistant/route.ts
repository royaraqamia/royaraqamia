import { NextRequest } from 'next/server';

import { getChatAssistant, startChatAssistant } from '@/backend/controllers/chat';
import { toNextResponse } from '@/backend/transport/http-result';

/**
 * The assistant thread and the state before it exists.
 *
 * `POST` is idempotent — one thread per member — and is called by the *first
 * message*, not by opening the sheet (#1859). `GET` says whether a provider key
 * is configured and how much of today's allowance is left, and with `?opening=1`
 * also projects the first screen's questions from the tool registry. Neither is
 * an error when the answer is "off" or "spent".
 */
export async function GET(req: NextRequest) {
  const opening = req.nextUrl.searchParams.get('opening') === '1';
  const eventId = req.nextUrl.searchParams.get('event') ?? undefined;
  return toNextResponse(await getChatAssistant({ opening, eventId }));
}

export async function POST(req: NextRequest) {
  return toNextResponse(await startChatAssistant(req.headers));
}
