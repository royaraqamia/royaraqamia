import { NextRequest } from 'next/server';
import { toNextResponse } from '@/backend/transport/http-result';
import { logout } from '@/backend/controllers/auth';

export async function POST(_req: NextRequest) {
  return toNextResponse(await logout());
}
