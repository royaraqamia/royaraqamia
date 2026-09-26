import { NextRequest } from 'next/server';
import { toNextResponse } from '@/backend/transport/http-result';
import { schedulePost } from '@/backend/controllers/blogpress';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const result = await schedulePost(id, body);
  return toNextResponse(result);
}
