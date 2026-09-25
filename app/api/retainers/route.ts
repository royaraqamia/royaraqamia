import { NextRequest } from 'next/server';
import { toNextResponse } from '@/backend/transport/http-result';
import { getClientIp } from '@/backend/transport/http';
import { submitRetainer } from '@/backend/controllers/retainers';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  return toNextResponse(await submitRetainer(body, getClientIp(req)));
}
