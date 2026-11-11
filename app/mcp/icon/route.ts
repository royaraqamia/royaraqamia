import { NextRequest } from 'next/server';

import { createDefaultMcpIconService } from '@/backend/config/mcp';
import { mcpMarketplaceIconRateLimitPolicy } from '@/backend/config/rate-limiter';
import { checkRateLimitApi } from '@/backend/middleware/http';
import { getClientIp } from '@/backend/transport/http';
import { toNextResponse } from '@/backend/transport/http-result';

export const runtime = 'nodejs';

/**
 * A catalogue row's brand mark (ADR-0155, the curated store).
 *
 * The route takes the row's own name, never a URL: the address is whatever the
 * row stored when it was probed, fetched through `backend/shared/egress`. That
 * is what keeps a hotlinked logo from reaching the member's browser and keeps
 * this from being a general proxy.
 *
 * A missing row and a failed fetch are the same 404, and the screen draws its
 * monogram tile; the difference is worth a log, not a member-facing error.
 */
export async function GET(req: NextRequest) {
  const rateLimited = await checkRateLimitApi({
    ...mcpMarketplaceIconRateLimitPolicy(getClientIp(req)),
    failClosed: false,
  });
  if (rateLimited) return toNextResponse(rateLimited);

  const name = req.nextUrl.searchParams.get('name') ?? '';
  const icon = await createDefaultMcpIconService().get(name);

  if (!icon) {
    return new Response(null, {
      status: 404,
      headers: { 'cache-control': 'public, max-age=60' },
    });
  }

  return new Response(icon.bytes.slice().buffer as ArrayBuffer, {
    headers: {
      'content-type': icon.mime,
      'cache-control': 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=604800',
      'x-content-type-options': 'nosniff',
      // An SVG is a document. Sandboxing it means a mark that carries a script
      // cannot act with our origin if someone opens the URL directly.
      'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    },
  });
}
