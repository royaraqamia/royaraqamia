import { NextRequest } from 'next/server';

import { updateMcpConnectionTool } from '@/backend/controllers/mcp-marketplace';
import { toNextResponse } from '@/backend/transport/http-result';

export const runtime = 'nodejs';

/** One tool's switch on one connection (ADR-0155, phase 3 / #1224). */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return toNextResponse(await updateMcpConnectionTool(id, req.headers, await req.text()));
}
