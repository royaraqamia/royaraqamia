import { NextRequest } from 'next/server';
import { toNextResponse } from '@/backend/transport/http-result';
import { getMyPlan } from '@/backend/controllers/plans';

export async function GET(_req: NextRequest) {
  return toNextResponse(await getMyPlan());
}
