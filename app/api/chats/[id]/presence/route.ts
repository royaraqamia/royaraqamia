import { NextRequest } from 'next/server';

import { getChatPresence } from '@/backend/controllers/chat';
import { toNextResponse } from '@/backend/transport/http-result';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return toNextResponse(await getChatPresence(id));
}
