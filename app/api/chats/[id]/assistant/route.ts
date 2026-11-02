import { NextRequest } from 'next/server';

import { streamChatAgentTurn } from '@/backend/controllers/chat';

/**
 * One assistant turn, streamed as SSE.
 *
 * The provider is slow and the member reads the answer as it is written, so this
 * is the surface's only streaming handler. It is capped below the platform's
 * function ceiling so a slow reply ends as a written state instead of being
 * killed mid-answer (#817).
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  return streamChatAgentTurn(id, body, req.headers);
}
