import { NextRequest } from 'next/server';

import { saveQuranReadingPosition } from '@/backend/controllers/quran';
import { toNextResponse } from '@/backend/transport/http-result';
import { parseBody } from '@/backend/transport/request-body';
import { QuranPositionWriteSchema } from '@/shared/contracts/quran';

export async function POST(req: NextRequest) {
  const parsed = parseBody(QuranPositionWriteSchema, await req.json().catch(() => null));
  if (!parsed.ok) return toNextResponse(parsed.result);
  return toNextResponse(await saveQuranReadingPosition(parsed.data));
}
