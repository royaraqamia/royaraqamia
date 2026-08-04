import { NextRequest } from 'next/server';
import { toNextResponse } from '@/backend/transport/http-result';
import { revalidateResultPaths } from '@/backend/transport/revalidate';
import { setPostFeatured } from '@/backend/controllers/blogpress';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await req.json()) as { featured?: unknown };
  const result = await setPostFeatured(id, Boolean(body.featured));
  revalidateResultPaths(result);
  return toNextResponse(result);
}
