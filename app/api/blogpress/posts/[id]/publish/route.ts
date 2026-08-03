import { NextRequest } from 'next/server';
import { toNextResponse } from '@/backend/transport/http-result';
import { revalidateResultPaths } from '@/backend/transport/revalidate';
import { publishPost } from '@/backend/controllers/blogpress';

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await publishPost(id);
  revalidateResultPaths(result);
  return toNextResponse(result);
}
