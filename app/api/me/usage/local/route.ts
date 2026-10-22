import { NextRequest } from 'next/server';
import { toNextResponse } from '@/backend/transport/http-result';
import { reportLocalUsage } from '@/backend/controllers/plans';

/**
 * POST /api/me/usage/local — reconciliation of the counters a device keeps
 * itself (ADR-0075). It spends the account's allowance for actions that already
 * happened offline; the client event id is what makes a retry free.
 */
export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return toNextResponse(await reportLocalUsage(null));
  }

  return toNextResponse(await reportLocalUsage(body));
}
