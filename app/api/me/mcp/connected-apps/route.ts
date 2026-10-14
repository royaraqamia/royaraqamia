import { NextRequest } from 'next/server';
import {
  disconnectAllMcpConnectedApps,
  listMcpConnectedApps,
} from '@/backend/controllers/mcp-connected-apps';
import { toNextResponse } from '@/backend/transport/http-result';

export async function GET() {
  return toNextResponse(await listMcpConnectedApps());
}

/** Disconnect every MCP client the caller has connected. */
export async function DELETE(req: NextRequest) {
  return toNextResponse(await disconnectAllMcpConnectedApps(req.headers));
}
