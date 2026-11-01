import { NextRequest } from 'next/server';

import { unblockChatUser } from '@/backend/controllers/chat';
import { toNextResponse } from '@/backend/transport/http-result';

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return toNextResponse(await unblockChatUser(id, req.headers));
}
