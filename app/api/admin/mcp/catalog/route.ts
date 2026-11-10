import { NextRequest } from 'next/server';

import { listMcpCatalogForAdmin, updateMcpCatalogRow } from '@/backend/controllers/mcp-catalog';
import { toNextResponse } from '@/backend/transport/http-result';

export const runtime = 'nodejs';

/**
 * The Admin Console's takedown list (ADR-0155, phase 2 / #1223).
 *
 * One collection, no per-row path: a registry name carries a slash
 * (`com.supabase/mcp`), and a dynamic segment holding one is a route that works
 * in a test and 404s through a proxy. The row to edit travels in the body.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  return toNextResponse(
    await listMcpCatalogForAdmin({
      q: searchParams.get('q'),
      cursor: searchParams.get('cursor'),
    })
  );
}

export async function PATCH(req: NextRequest) {
  const body = await req.json().catch(() => null);
  return toNextResponse(await updateMcpCatalogRow(body));
}
