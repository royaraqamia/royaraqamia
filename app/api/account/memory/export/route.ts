import { exportAgentMemory } from '@/backend/controllers/account-memory';
import { toNextResponse } from '@/backend/transport/http-result';

/**
 * `GET /api/account/memory/export`: the same rows the page draws, as a file the
 * member downloads (ADR-0182 decision 6, #1428).
 */
export async function GET() {
  return toNextResponse(await exportAgentMemory());
}
