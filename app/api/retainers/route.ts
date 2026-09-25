import { NextRequest } from 'next/server';
import { toNextResponse } from '@/backend/transport/http-result';
import { getClientIp } from '@/backend/transport/http';
import { listRetainers, submitRetainer } from '@/backend/controllers/retainers';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  return toNextResponse(
    await listRetainers(
      Number(searchParams.get('page') ?? '1') || 1,
      Number(searchParams.get('pageSize') ?? '20') || 20,
      searchParams.get('status'),
      searchParams.get('search')
    )
  );
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  return toNextResponse(await submitRetainer(body, getClientIp(req)));
}
