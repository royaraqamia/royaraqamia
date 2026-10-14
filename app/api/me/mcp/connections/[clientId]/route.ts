import { NextRequest } from 'next/server';
import { disconnectMcpConnection } from '@/backend/controllers/mcp-connections';
import { toNextResponse } from '@/backend/transport/http-result';

/** Disconnect one connected MCP client. */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ clientId: string }> }
) {
  const { clientId } = await params;
  return toNextResponse(await disconnectMcpConnection(clientId, req.headers));
}
