import { NextRequest } from 'next/server';
import { toNextResponse } from '@/backend/transport/http-result';
import { getClientIp } from '@/backend/transport/http';
import { createBooking } from '@/backend/controllers/consultation';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  return toNextResponse(await createBooking(body, getClientIp(req)));
}
