import { type NextRequest } from 'next/server';

import { enableMyPersonalDigest, getMyNewsPrivateSources } from '@/backend/controllers/news';
import { toNextResponse } from '@/backend/transport/http-result';

/** The reader's own feeds, with the plan's ceiling and whether their digest is on. */
export async function GET() {
  return toNextResponse(await getMyNewsPrivateSources());
}

/** Turns the reader's own digest on; the selection is left as it was. */
export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  return toNextResponse(await enableMyPersonalDigest(body, req.headers));
}
