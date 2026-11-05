import { type NextRequest } from 'next/server';

import { submitNewsSourceRequest } from '@/backend/controllers/news';
import { toNextResponse } from '@/backend/transport/http-result';

/**
 * Files a link for the resolver. The reader's list of what they filed is the
 * same one list `/api/me/news-private-sources` answers (ADR-0130).
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  return toNextResponse(await submitNewsSourceRequest(body, req.headers));
}
