import { NextRequest } from 'next/server';
import { toNextResponse } from '@/backend/transport/http-result';
import { getAppVersion } from '@/backend/controllers/version';

export async function GET(_req: NextRequest) {
  return toNextResponse(await getAppVersion());
}
