import { NextRequest } from 'next/server';
import { toNextResponse } from '@/backend/transport/http-result';
import { bulkLinkAction } from '@/backend/controllers/linksnap';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  return toNextResponse(await bulkLinkAction(req.headers.get('Authorization'), body ?? {}));
}
