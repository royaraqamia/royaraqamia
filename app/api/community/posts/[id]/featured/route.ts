import { NextRequest } from 'next/server';
import { toNextResponse } from '@/backend/transport/http-result';
import { setPostFeatured } from '@/backend/controllers/blogpress';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const result = await setPostFeatured(id, Boolean(body.featured));
  return toNextResponse(result);
}
