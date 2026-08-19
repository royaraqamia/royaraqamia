import { NextRequest } from 'next/server';
import { toNextResponse } from '@/backend/transport/http-result';
import { broadcastMessage } from '@/backend/controllers/broadcast';

export async function POST(req: NextRequest) {
  const body = await req.json();
  return toNextResponse(await broadcastMessage(body));
}
