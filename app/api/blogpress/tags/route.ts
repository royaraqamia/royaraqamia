import { NextRequest } from 'next/server';
import { toNextResponse } from '@/backend/transport/http-result';
import { listBlogTags, createBlogTag } from '@/backend/controllers/blogpress';

export async function GET() {
  const result = await listBlogTags();
  return toNextResponse(result);
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as Record<string, unknown>;
  const result = await createBlogTag(body);
  return toNextResponse(result);
}
