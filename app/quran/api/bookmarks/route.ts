import { NextRequest } from 'next/server';

import { saveQuranBookmark } from '@/backend/controllers/quran';
import { toNextResponse } from '@/backend/transport/http-result';
import { parseBody } from '@/backend/transport/request-body';
import { QuranBookmarkWriteSchema } from '@/shared/contracts/quran';

export async function POST(req: NextRequest) {
  const parsed = parseBody(QuranBookmarkWriteSchema, await req.json().catch(() => null));
  if (!parsed.ok) return toNextResponse(parsed.result);
  return toNextResponse(await saveQuranBookmark(parsed.data));
}
