import { NextRequest } from 'next/server';
import { toNextResponse } from '@/backend/transport/http-result';
import { saveAndPublishPost } from '@/backend/controllers/blogpress';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const result = await saveAndPublishPost(id, body);
  return toNextResponse(result);
}
