import { listMcpConnections } from '@/backend/controllers/mcp-marketplace';
import { toNextResponse } from '@/backend/transport/http-result';

export const runtime = 'nodejs';

/**
 * The apps نور reaches, for the signed-in member (ADR-0155, phase 3 / #1224).
 *
 * Every row is the member's own: the repository filters on the session's user
 * id, so a shared cache must not answer this. `no-store` is set by the
 * controller, on the same never-cache prefix every `/api/me` read uses.
 */
export async function GET() {
  return toNextResponse(await listMcpConnections());
}
