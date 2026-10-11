import { NextRequest } from 'next/server';
import { toNextResponse } from '@/backend/transport/http-result';
import { updateName } from '@/backend/controllers/profile';

export async function PATCH(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  return toNextResponse(await updateName(body, req.headers));
}
