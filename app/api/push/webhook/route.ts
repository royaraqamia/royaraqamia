import { NextRequest } from 'next/server';
import { toNextResponse } from '@/backend/transport/http-result';
import { webhookPush } from '@/backend/controllers/push';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  return toNextResponse(await webhookPush(body, req.headers));
}
