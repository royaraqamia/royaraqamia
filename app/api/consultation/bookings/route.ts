import { NextRequest } from 'next/server';
import { toNextResponse } from '@/backend/transport/http-result';
import { createBooking, listMyBookings } from '@/backend/controllers/consultation';

export async function GET() {
  return toNextResponse(await listMyBookings());
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  return toNextResponse(await createBooking(body));
}
