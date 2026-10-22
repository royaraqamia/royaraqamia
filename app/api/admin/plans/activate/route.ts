import { NextRequest } from 'next/server';
import { toNextResponse } from '@/backend/transport/http-result';
import { activateUserPlan } from '@/backend/controllers/plans-admin';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  return toNextResponse(await activateUserPlan(body));
}
