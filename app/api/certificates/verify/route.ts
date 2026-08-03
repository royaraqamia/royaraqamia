import { NextRequest } from 'next/server';
import { toNextResponse } from '@/backend/transport/http-result';
import { verifyCertificate } from '@/backend/controllers/certificates';
import { getClientIp } from '@/backend/transport/http';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const ip = getClientIp(req);
  return toNextResponse(await verifyCertificate(body.code, ip));
}
