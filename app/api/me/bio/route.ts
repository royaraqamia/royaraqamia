import { NextRequest } from 'next/server';
import { toNextResponse } from '@/backend/transport/http-result';
import { updateBio } from '@/backend/controllers/profile';

export async function PATCH(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  return toNextResponse(await updateBio(body, req.headers));
}
