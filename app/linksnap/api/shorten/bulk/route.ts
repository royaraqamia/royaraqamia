import { NextRequest } from 'next/server';
import { toNextResponse } from '@/backend/transport/http-result';
import { bulkShorten } from '@/backend/controllers/linksnap';

export async function POST(req: NextRequest) {
  const body = await req.json();
  return toNextResponse(await bulkShorten(req.headers.get('Authorization'), body));
}
