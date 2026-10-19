import { NextRequest } from 'next/server';

import { syncQuran } from '@/backend/controllers/quran';
import { toNextResponse } from '@/backend/transport/http-result';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  return toNextResponse(await syncQuran(searchParams));
}
