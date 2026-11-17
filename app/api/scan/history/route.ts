import { NextRequest } from 'next/server';

import { clearScanHistory, listScanHistory, recordScan } from '@/backend/controllers/scan-history';
import { toNextResponse } from '@/backend/transport/http-result';

/**
 * The scan history (#1430, ADR-0205).
 *
 * Three verbs on one collection: the list the surface draws, the summary the
 * Scanner writes after a code is read, and the member's clear. There is no
 * per-row route: a row is something found again, and deletion is the whole list.
 */
export async function GET() {
  return toNextResponse(await listScanHistory());
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  return toNextResponse(await recordScan(body, req.headers));
}

export async function DELETE(req: NextRequest) {
  return toNextResponse(await clearScanHistory(req.headers));
}
