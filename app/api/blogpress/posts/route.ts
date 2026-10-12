import { NextRequest } from 'next/server';
import { toNextResponse } from '@/backend/transport/http-result';
import { createPost } from '@/backend/controllers/blogpress';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const result = await createPost(body);
  return toNextResponse(result);
}
