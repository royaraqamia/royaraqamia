import { NextRequest } from 'next/server';
import { touchLastSeen } from '@/backend/controllers/profile';
import { toNextResponse } from '@/backend/transport/http-result';

export async function POST(req: NextRequest) {
  return toNextResponse(await touchLastSeen(req.headers));
}
