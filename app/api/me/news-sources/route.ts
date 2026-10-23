import { type NextRequest } from 'next/server';

import { getMyNewsSources, updateMyNewsSources } from '@/backend/controllers/news';
import { toNextResponse } from '@/backend/transport/http-result';

export async function GET() {
  return toNextResponse(await getMyNewsSources());
}

export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  return toNextResponse(await updateMyNewsSources(body, req.headers));
}
