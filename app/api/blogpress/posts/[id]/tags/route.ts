import { NextRequest } from 'next/server';
import { toNextResponse } from '@/backend/transport/http-result';
import { revalidateResultPaths } from '@/backend/transport/revalidate';
import { setBlogPostTags } from '@/backend/controllers/blogpress';

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await req.json()) as Record<string, unknown>;
  const result = await setBlogPostTags(id, body);
  revalidateResultPaths(result);
  return toNextResponse(result);
}
