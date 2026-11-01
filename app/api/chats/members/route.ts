import { NextRequest } from 'next/server';

import { searchChatMembers } from '@/backend/controllers/chat';
import { toNextResponse } from '@/backend/transport/http-result';

/** The "new chat" picker's member search: verified members matching `q`. */
export async function GET(req: NextRequest) {
  return toNextResponse(await searchChatMembers(req.nextUrl.searchParams.get('q')));
}
