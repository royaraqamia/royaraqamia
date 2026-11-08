import { NextRequest } from 'next/server';
import { toNextResponse } from '@/backend/transport/http-result';
import { bulkPostsAction } from '@/backend/controllers/blogpress';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const result = await bulkPostsAction(body ?? {});
  return toNextResponse(result);
}
