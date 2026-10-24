import { type NextRequest } from 'next/server';

import { getMyNewsSourceRequests, submitNewsSourceRequest } from '@/backend/controllers/news';
import { toNextResponse } from '@/backend/transport/http-result';

export async function GET() {
  return toNextResponse(await getMyNewsSourceRequests());
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  return toNextResponse(await submitNewsSourceRequest(body, req.headers));
}
