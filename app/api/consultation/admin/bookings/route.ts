import { NextRequest } from 'next/server';
import { toNextResponse } from '@/backend/transport/http-result';
import { adminListBookings } from '@/backend/controllers/consultation';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const page = Number(searchParams.get('page') ?? '1') || 1;
  const pageSize = Number(searchParams.get('pageSize') ?? '50') || 50;
  return toNextResponse(await adminListBookings(page, pageSize, searchParams.get('status')));
}
