import { NextRequest } from 'next/server';
import { toNextResponse } from '@/backend/transport/http-result';
import { subscribePush, unsubscribePush } from '@/backend/controllers/push';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  return toNextResponse(await subscribePush(body, req.headers));
}

export async function DELETE(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  return toNextResponse(await unsubscribePush(body, req.headers));
}
