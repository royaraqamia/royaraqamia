import { NextRequest } from 'next/server';

import { respondToChat } from '@/backend/controllers/chat';
import { toNextResponse } from '@/backend/transport/http-result';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  return toNextResponse(await respondToChat(id, body, req.headers));
}
