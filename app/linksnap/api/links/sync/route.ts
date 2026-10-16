import { NextRequest } from 'next/server';
import { toNextResponse } from '@/backend/transport/http-result';
import { listLinksForSync } from '@/backend/controllers/linksnap';

export async function GET(req: NextRequest) {
  return toNextResponse(await listLinksForSync(req.headers.get('Authorization')));
}
