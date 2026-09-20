import { NextRequest } from 'next/server';
import { toNextResponse } from '@/backend/transport/http-result';
import { revalidateResultPaths } from '@/backend/transport/revalidate';
import { restorePost } from '@/backend/controllers/blogpress';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const result = await restorePost(body);
  revalidateResultPaths(result);
  return toNextResponse(result);
}
