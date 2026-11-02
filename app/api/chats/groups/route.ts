import { NextRequest } from 'next/server';

import { createChatGroup } from '@/backend/controllers/chat';
import { toNextResponse } from '@/backend/transport/http-result';

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  return toNextResponse(await createChatGroup(body, req.headers));
}
