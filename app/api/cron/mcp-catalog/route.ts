import { NextRequest } from 'next/server';

import { syncMcpCatalog } from '@/backend/controllers/mcp-catalog';
import { toNextResponse } from '@/backend/transport/http-result';

/**
 * The catalogue mirror (ADR-0155, phase 2 / #1223). `CRON_SECRET` authorises it,
 * like every sweep.
 *
 * `maxDuration` is the ceiling a full pass is measured against: the sync stops
 * itself at 35s and saves its cursor, so a run that reaches the end of the
 * registry's page list is the exception rather than the requirement.
 */
export const maxDuration = 60;
export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  return toNextResponse(await syncMcpCatalog(req.headers));
}
