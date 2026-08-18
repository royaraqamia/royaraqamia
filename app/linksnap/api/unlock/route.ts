import { NextRequest } from 'next/server';
import { toNextResponse } from '@/backend/transport/http-result';
import { unlockLinkPassword } from '@/backend/controllers/linksnap';
import { getClientIp } from '@/backend/transport/http';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  return toNextResponse(await unlockLinkPassword(getClientIp(req), body));
}
