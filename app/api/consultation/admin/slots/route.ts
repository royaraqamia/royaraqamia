import { NextRequest } from 'next/server';
import { toNextResponse } from '@/backend/transport/http-result';
import { adminCreateSlot, adminListSlots } from '@/backend/controllers/consultation';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  return toNextResponse(await adminListSlots(searchParams.get('from')));
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  return toNextResponse(await adminCreateSlot(body));
}
