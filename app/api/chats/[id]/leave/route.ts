import { NextRequest } from 'next/server';

import { leaveChat } from '@/backend/controllers/chat';
import { toNextResponse } from '@/backend/transport/http-result';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return toNextResponse(await leaveChat(id, req.headers));
}
