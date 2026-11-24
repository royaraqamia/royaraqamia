import { NextRequest } from 'next/server';

import { grantAgentTool, readAgentToolGrants } from '@/backend/controllers/agent-tool-grants';
import { toNextResponse } from '@/backend/transport/http-result';

/**
 * `GET /api/account/assistant/grants`: the member's live tool grants and the
 * tools they may grant now (ADR-0180, #1438).
 *
 * `POST` grants one tier-1 tool the member has already seen run. A tier-2 or
 * tier-3 tool is refused here by the service, not only by the UI.
 */
export async function GET() {
  return toNextResponse(await readAgentToolGrants());
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  return toNextResponse(await grantAgentTool(body, req.headers));
}
