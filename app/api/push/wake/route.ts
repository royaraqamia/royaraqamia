import { NextRequest } from 'next/server';
import { toNextResponse } from '@/backend/transport/http-result';
import { wakeDevices } from '@/backend/controllers/push';

/**
 * The background tier's sync hint (ADR-0059, ADR-0060): a device that just
 * delivered a write asks the server to wake the account's other devices. The
 * answer is not something a caller acts on — the request is best-effort by
 * design, and the receiving devices' own floor is still in place.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  return toNextResponse(await wakeDevices(body, req.headers));
}
