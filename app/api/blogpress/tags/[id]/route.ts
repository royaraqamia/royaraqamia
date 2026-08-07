import { NextRequest } from 'next/server';
import { toNextResponse } from '@/backend/transport/http-result';
import { deleteBlogTag } from '@/backend/controllers/blogpress';

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await deleteBlogTag(id);
  return toNextResponse(result);
}