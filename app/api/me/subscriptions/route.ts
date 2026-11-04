import { type NextRequest } from 'next/server';

import {
  listMySubscriptionRequests,
  submitSubscriptionRequest,
} from '@/backend/controllers/subscriptions';
import { toNextResponse } from '@/backend/transport/http-result';

export async function GET() {
  return toNextResponse(await listMySubscriptionRequests());
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  return toNextResponse(await submitSubscriptionRequest(body));
}
