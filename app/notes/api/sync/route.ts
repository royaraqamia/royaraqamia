import { NextRequest } from 'next/server';

import { syncNotes } from '@/backend/controllers/notes';
import { toNextResponse } from '@/backend/transport/http-result';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  return toNextResponse(await syncNotes(searchParams));
}
