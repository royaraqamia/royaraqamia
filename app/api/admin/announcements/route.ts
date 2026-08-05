import { NextRequest } from 'next/server';
import { toNextResponse } from '@/backend/transport/http-result';
import { broadcastAnnouncement } from '@/backend/controllers/notifications';

export async function POST(req: NextRequest) {
  const body = await req.json();
  return toNextResponse(await broadcastAnnouncement(body));
}
