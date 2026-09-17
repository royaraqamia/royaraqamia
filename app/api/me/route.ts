import { NextRequest } from 'next/server';
import { toNextResponse } from '@/backend/transport/http-result';
import { getMyAdminStatus } from '@/backend/controllers/me';

export async function GET(_req: NextRequest) {
  return toNextResponse(await getMyAdminStatus());
}
