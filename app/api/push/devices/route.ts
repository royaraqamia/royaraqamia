import { NextRequest } from 'next/server';
import { toNextResponse } from '@/backend/transport/http-result';
import { registerDeviceToken, unregisterDeviceToken } from '@/backend/controllers/push';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  return toNextResponse(await registerDeviceToken(body, req.headers));
}

export async function DELETE(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  return toNextResponse(await unregisterDeviceToken(body, req.headers));
}
