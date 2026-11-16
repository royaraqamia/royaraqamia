import { readAgentMemory } from '@/backend/controllers/account-memory';
import { toNextResponse } from '@/backend/transport/http-result';

/**
 * `GET /api/account/memory`: the facts the assistant remembers and the three
 * per-scope switches (ADR-0182 decision 6, #1428).
 */
export async function GET() {
  return toNextResponse(await readAgentMemory());
}
