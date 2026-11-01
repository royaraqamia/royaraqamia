import { NextRequest } from 'next/server';

import { listChatMessages, sendChatMessage } from '@/backend/controllers/chat';
import { toNextResponse } from '@/backend/transport/http-result';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return toNextResponse(await listChatMessages(id, req.nextUrl.searchParams.get('before')));
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  return toNextResponse(await sendChatMessage(id, body, req.headers));
}
