import { NextRequest } from 'next/server';
import {
  disconnectAllMcpConnections,
  listMcpConnections,
} from '@/backend/controllers/mcp-connections';
import { toNextResponse } from '@/backend/transport/http-result';

export async function GET() {
  return toNextResponse(await listMcpConnections());
}

/** Disconnect every MCP client the caller has connected. */
export async function DELETE(req: NextRequest) {
  return toNextResponse(await disconnectAllMcpConnections(req.headers));
}
