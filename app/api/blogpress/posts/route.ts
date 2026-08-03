import { NextRequest } from 'next/server';
import { toNextResponse } from '@/backend/transport/http-result';
import { revalidateResultPaths } from '@/backend/transport/revalidate';
import { createPost } from '@/backend/controllers/blogpress';

export async function POST(_req: NextRequest) {
  const result = await createPost();
  revalidateResultPaths(result);
  return toNextResponse(result);
}
