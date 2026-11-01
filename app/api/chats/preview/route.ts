import { NextRequest } from 'next/server';

import { previewChat } from '@/backend/controllers/chat';
import { toNextResponse } from '@/backend/transport/http-result';

export async function GET(req: NextRequest) {
  return toNextResponse(await previewChat(req.nextUrl.searchParams.get('to')));
}
