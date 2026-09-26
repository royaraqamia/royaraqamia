import { NextRequest } from 'next/server';
import { toNextResponse } from '@/backend/transport/http-result';
import { setBlogPostTags } from '@/backend/controllers/blogpress';

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const result = await setBlogPostTags(id, body);
  return toNextResponse(result);
}
