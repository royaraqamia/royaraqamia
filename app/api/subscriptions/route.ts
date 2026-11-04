import { NextRequest } from 'next/server';
import { toNextResponse } from '@/backend/transport/http-result';
import { listSubscriptionRequests } from '@/backend/controllers/subscriptions';

/** The Admin list. The reader's own submit and history are `/api/me/subscriptions`. */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  return toNextResponse(
    await listSubscriptionRequests(
      Number(searchParams.get('page') ?? '1') || 1,
      Number(searchParams.get('pageSize') ?? '20') || 20,
      searchParams.get('status'),
      searchParams.get('search')
    )
  );
}
