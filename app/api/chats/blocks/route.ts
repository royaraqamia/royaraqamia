import { NextRequest } from 'next/server';

import { blockChatUser, listBlockedChatUsers } from '@/backend/controllers/chat';
import { toNextResponse } from '@/backend/transport/http-result';

export async function GET() {
  return toNextResponse(await listBlockedChatUsers());
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  return toNextResponse(await blockChatUser(body, req.headers));
}
