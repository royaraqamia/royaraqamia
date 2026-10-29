import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createPlanGate } from '@/backend/config/plans';
import { OWNED_ITEMS, type OwnedItemKey } from '@/shared/contracts/plans';
import type { McpUserContext } from '../session';
import { MCP_SERVER_NAME, MCP_SERVER_VERSION } from '../constants';
import { registerSystemTools } from './system';
import { registerCommunityTools, registerCommunityWriteTools } from './blogpress';
import { registerLinkSnapTools, registerLinkSnapWriteTools } from './linksnap';
import { registerSpendTrackTools, registerSpendTrackWriteTools } from './spendtrack';
import { registerHabitFlowTools, registerHabitFlowWriteTools } from './habitflow';
import { registerCertificateTools, registerCertificateWriteTools } from './certificates';
import { registerProfileTools, registerProfileWriteTools } from './profile';
import { toolErrorResponse } from './tool-utils';

/**
 * A create through MCP fills the same standing slot its HTTP twin does, so the
 * cap belongs to the tool, not to the handler: one map, next to the registry
 * that names the tools, is what keeps the two paths from drifting.
 *
 * Only tools that always take a new slot belong here. `spendtrack_set_budget`
 * does not: writing a month/category that already has a budget is an update, and
 * the handler asks for the cap itself only when the row is new (#526), exactly
 * as the HTTP controller does.
 */
const CAPPED_TOOLS: Record<string, OwnedItemKey> = {
  [`${MCP_SERVER_NAME}_linksnap_create_link`]: OWNED_ITEMS.shortLinks,
  [`${MCP_SERVER_NAME}_community_create_post`]: OWNED_ITEMS.communityDrafts,
  [`${MCP_SERVER_NAME}_community_create_tag`]: OWNED_ITEMS.communityTags,
  [`${MCP_SERVER_NAME}_community_create_category`]: OWNED_ITEMS.communityCategories,
  [`${MCP_SERVER_NAME}_spendtrack_create_expense`]: OWNED_ITEMS.expenses,
  [`${MCP_SERVER_NAME}_spendtrack_create_category`]: OWNED_ITEMS.expenseCategories,
  [`${MCP_SERVER_NAME}_habitflow_create_habit`]: OWNED_ITEMS.habits,
};

type ToolHandler = (...args: unknown[]) => unknown;
type RegisterTool = (name: string, config: unknown, handler: ToolHandler) => unknown;

/**
 * Wraps `registerTool` so every write tool checks its cap first (ADR-0093). A
 * refusal comes back as a tool error — the same shape a handler's own failure
 * takes — because an MCP client has no HTTP status to read.
 */
function meteredWrites(server: McpServer, ctx: McpUserContext): McpServer {
  const register = server.registerTool.bind(server) as RegisterTool;

  return new Proxy(server, {
    get(target, property, receiver) {
      if (property !== 'registerTool') return Reflect.get(target, property, receiver);

      return (name: string, config: unknown, handler: ToolHandler) => {
        const cappedHandler = async (...args: unknown[]): Promise<unknown> => {
          const userId = ctx.userId;
          // Write tools already require a user; this only keeps the wrapper
          // honest if one is ever registered without that guard.
          if (!userId) return handler(...args);

          try {
            const item = CAPPED_TOOLS[name];
            if (item) await createPlanGate().cap(userId, item);
            return await handler(...args);
          } catch (error) {
            return toolErrorResponse(error);
          }
        };

        return register(name, config, cappedHandler);
      };
    },
  }) as unknown as McpServer;
}

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

  const writes = meteredWrites(server, ctx);

  registerSystemTools(server, ctx);
  registerCommunityTools(server, ctx);
  registerCommunityWriteTools(writes, ctx);
  registerLinkSnapTools(server, ctx);
  registerLinkSnapWriteTools(writes, ctx);
  registerSpendTrackTools(server, ctx);
  registerSpendTrackWriteTools(writes, ctx);
  registerHabitFlowTools(server, ctx);
  registerHabitFlowWriteTools(writes, ctx);
  registerCertificateTools(server, ctx);
  registerCertificateWriteTools(writes, ctx);
  registerProfileTools(server, ctx);
  registerProfileWriteTools(writes, ctx);

  return server;
}
