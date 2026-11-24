import { NextRequest } from 'next/server';

import { revokeAgentTool } from '@/backend/controllers/agent-tool-grants';
import { toNextResponse } from '@/backend/transport/http-result';

/**
 * `DELETE /api/account/assistant/grants/[id]`: revoke one live grant. The next
 * turn reads a live grant before a tool runs, so the revocation stops the next
 * call (ADR-0180 decision 2, #1438).
 */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return toNextResponse(await revokeAgentTool(id, req.headers));
}
