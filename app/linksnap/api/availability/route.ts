import { NextRequest } from 'next/server';
import { toNextResponse } from '@/backend/transport/http-result';
import { checkCodeAvailability } from '@/backend/controllers/linksnap';
import { getClientIp } from '@/backend/transport/http';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  return toNextResponse(
    await checkCodeAvailability(
      req.headers.get('Authorization'),
      getClientIp(req),
      searchParams.get('code')
    )
  );
}
