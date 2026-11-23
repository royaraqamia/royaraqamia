import { NextRequest, NextResponse } from 'next/server';

import { getChatMedia } from '@/backend/controllers/chat';
import { toNextResponse } from '@/backend/transport/http-result';

/**
 * One member-paid picture or clip (ADR-0216). The descriptor in the chat message
 * names this route with a conversation id and a storage object inside it; the
 * service checks that the member is in that conversation and answers a fresh
 * short-lived URL. A browser never sees a vendor token or a vendor link.
 */
export async function GET(req: NextRequest) {
  const conversationId = req.nextUrl.searchParams.get('conversationId') ?? '';
  const storagePath = req.nextUrl.searchParams.get('path') ?? '';
  if (!conversationId || !storagePath) {
    return NextResponse.json({ success: false, error: 'الملف غير موجود' }, { status: 400 });
  }

  const response = toNextResponse(await getChatMedia(conversationId, storagePath));
  response.headers.set('Cache-Control', 'no-store');
  return response;
}
