import { NextRequest } from 'next/server';
import { toNextResponse } from '@/backend/transport/http-result';
import { getClientIp } from '@/backend/transport/http';
import { submitProjectRequest } from '@/backend/controllers/project-requests';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  return toNextResponse(await submitProjectRequest(body, getClientIp(req)));
}
