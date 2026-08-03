import { NextRequest } from 'next/server';
import { toNextResponse } from '@/backend/transport/http-result';
import { revalidateResultPaths } from '@/backend/transport/revalidate';
import { saveAndPublishPost } from '@/backend/controllers/blogpress';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const result = await saveAndPublishPost(id, body);
  revalidateResultPaths(result);
  return toNextResponse(result);
}
