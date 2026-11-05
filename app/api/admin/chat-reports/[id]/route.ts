import { type NextRequest } from 'next/server';

import { decideChatReport } from '@/backend/controllers/chat-reports-admin';
import { toNextResponse } from '@/backend/transport/http-result';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  return toNextResponse(await decideChatReport(id, body));
}
