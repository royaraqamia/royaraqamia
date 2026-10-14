import { NextRequest } from 'next/server';
import { disconnectMcpConnectedApp } from '@/backend/controllers/mcp-connected-apps';
import { toNextResponse } from '@/backend/transport/http-result';

/** Disconnect one connected MCP client. */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ clientId: string }> }
) {
  const { clientId } = await params;
  return toNextResponse(await disconnectMcpConnectedApp(clientId, req.headers));
}
