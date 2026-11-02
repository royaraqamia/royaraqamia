import { NextRequest } from 'next/server';

import { sweepChatAttachments } from '@/backend/controllers/chat-attachments';
import { toNextResponse } from '@/backend/transport/http-result';

/** Vercel Cron's daily call; `CRON_SECRET` is what authorises it. */
export async function GET(req: NextRequest) {
  return toNextResponse(await sweepChatAttachments(req.headers));
}
