import { NextRequest } from 'next/server';
import { toNextResponse } from '@/backend/transport/http-result';
import { getClientIp } from '@/backend/transport/http';
import { listProjectRequests, submitProjectRequest } from '@/backend/controllers/project-requests';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  return toNextResponse(
    await listProjectRequests(
      Number(searchParams.get('page') ?? '1') || 1,
      Number(searchParams.get('pageSize') ?? '20') || 20,
      searchParams.get('status'),
      searchParams.get('search')
    )
  );
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  return toNextResponse(await submitProjectRequest(body, getClientIp(req)));
}
