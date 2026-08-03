import { NextRequest } from 'next/server';
import { toNextResponse } from '@/backend/transport/http-result';
import { shortenUrl } from '@/backend/controllers/linksnap';
import { getClientIp } from '@/backend/transport/http';

export async function POST(req: NextRequest) {
  const body = await req.json();
  return toNextResponse(await shortenUrl(req.headers.get('Authorization'), getClientIp(req), body));
}
