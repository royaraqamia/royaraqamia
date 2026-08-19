import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpUserContext } from '../session';
import { MCP_SERVER_NAME, MCP_SERVER_VERSION } from '../constants';
import { registerSystemTools } from './system';

/**
 * Tool registry for the public royaraqamia MCP server.
 *
 * A fresh McpServer is created per request (stateless transport), so tools are
 * registered against the request-scoped user context: every tool callback
 * closes over the same `ctx` the auth middleware resolved, and enforces its
 * scopes with the `requireScope` guard in each product module.
 */
export function createMcpServer(ctx: McpUserContext): McpServer {
  const server = new McpServer({
    name: MCP_SERVER_NAME,
    version: MCP_SERVER_VERSION,
  });

  registerSystemTools(server, ctx);

  return server;
}
