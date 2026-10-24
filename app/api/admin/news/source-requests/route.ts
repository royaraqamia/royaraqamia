import { type NextRequest } from 'next/server';

import { listNewsSourceRequests } from '@/backend/controllers/news-admin';
import { toNextResponse } from '@/backend/transport/http-result';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  return toNextResponse(
    await listNewsSourceRequests({ status: searchParams.get('status') ?? undefined })
  );
}
