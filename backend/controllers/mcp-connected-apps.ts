import { createDefaultMcpConnectedAppService } from '@/backend/config/mcp';
import { jsonResult, type HttpResult } from '@/backend/transport/http-result';
import { isSameOrigin } from '@/backend/transport/http';
import { withAuthenticatedUser } from '@/backend/transport/session-handler';
import type {
  McpConnectedAppActionResult,
  McpConnectedAppListResult,
} from '@/shared/contracts/mcp-connected-apps';

/**
 * The account area's "connected apps" surface: which MCP clients reach the
 * signed-in user's data, and how to disconnect one without signing out of the
 * site.
 *
 * RFC 7009 `/mcp/revoke` cannot serve this. It authenticates the OAuth *client*
 * (client_id + client_secret) and derives the user from the token presented, so
 * a user has no way to address a grant they own but hold no secret for.
 */

export async function listMcpConnectedApps(): Promise<HttpResult> {
  return withAuthenticatedUser(
    async ({ userId }) => {
      const data = await createDefaultMcpConnectedAppService().list(userId);
      return jsonResult(200, { success: true, data } satisfies McpConnectedAppListResult);
    },
    { whenFailed: { success: false, error: 'تعذّر تحميل التَّطبيقات المتَّصلة.' } }
  );
}

/**
 * Disconnects one client. An id that matches nothing the user holds succeeds
 * silently: the outcome the caller asked for — that client is not connected — is
 * already true, and answering differently would let one user probe for another's
 * client_ids.
 */
export async function disconnectMcpConnectedApp(
  clientId: string,
  headers: Headers
): Promise<HttpResult> {
  return withAuthenticatedUser(
    async ({ userId }) => {
      if (!isSameOrigin(headers)) {
        return jsonResult(403, {
          success: false,
          error: 'طلب غير مسموح',
        } satisfies McpConnectedAppActionResult);
      }

      await createDefaultMcpConnectedAppService().disconnect(userId, clientId);
      return jsonResult(200, { success: true } satisfies McpConnectedAppActionResult);
    },
    { whenFailed: { success: false, error: 'تعذّر فصل التَّطبيق.' } }
  );
}

/** Disconnects every MCP client the user has. Leaves their site session alone. */
export async function disconnectAllMcpConnectedApps(headers: Headers): Promise<HttpResult> {
  return withAuthenticatedUser(
    async ({ userId }) => {
      if (!isSameOrigin(headers)) {
        return jsonResult(403, {
          success: false,
          error: 'طلب غير مسموح',
        } satisfies McpConnectedAppActionResult);
      }

      await createDefaultMcpConnectedAppService().disconnectAll(userId);
      return jsonResult(200, { success: true } satisfies McpConnectedAppActionResult);
    },
    { whenFailed: { success: false, error: 'تعذّر فصل التَّطبيقات.' } }
  );
}
