import { NextRequest } from 'next/server';
import { toNextResponse } from '@/backend/transport/http-result';
import { adminBookingAction } from '@/backend/controllers/consultation';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  return toNextResponse(await adminBookingAction(id, body));
}
