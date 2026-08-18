import { NextRequest } from 'next/server';
import { toNextResponse } from '@/backend/transport/http-result';
import { duplicatePost } from '@/backend/controllers/blogpress';

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return toNextResponse(await duplicatePost(id));
}
