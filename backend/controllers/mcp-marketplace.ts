import { z } from 'zod';

import {
  createDefaultMcpConnectService,
  createDefaultMcpConnectionService,
} from '@/backend/config/mcp';
import { env } from '@/backend/config/env';
import { jsonResult, type HttpResult } from '@/backend/transport/http-result';
import { isSameOrigin } from '@/backend/transport/http';
import { withAuthenticatedUser } from '@/backend/transport/session-handler';
import { McpConnectError } from '@/backend/services/mcp/marketplace/connect-service';
import { McpRemoteError } from '@/backend/clients/mcp-remote';
import { logger } from '@/backend/shared/logger';
import {
  McpConnectionToolUpdateSchema,
  McpConnectionUpdateSchema,
  type McpConnectionActionResult,
  type McpConnectionDetailResult,
  type McpConnectionListResult,
} from '@/shared/contracts/mcp-marketplace';

/**
 * The marketplace's write surface: start a connection, and finish one.
 *
 * Both are deliberately thin. The flow, the egress policy and the encryption
 * live in `backend/services/mcp/marketplace` and
 * `backend/clients/mcp-remote`; this file resolves the member, refuses a
 * cross-origin start, and turns a refusal into a sentence rather than a stack.
 */

const StartBodySchema = z.strictObject({
  registryName: z.string().trim().min(1).max(200),
});

/** `/mcp/apps` is the marketplace; the tab is state, and the screen maps a code. */
const MARKETPLACE_PATH = '/mcp/apps';

function appUrl(path: string, search: Record<string, string> = {}): string {
  const url = new URL(path, env.siteUrl);
  for (const [key, value] of Object.entries(search)) url.searchParams.set(key, value);
  return url.toString();
}

/** The one redirect URI every provider registers, never the request's Host. */
export function mcpCallbackUrl(): string {
  return new URL('/mcp/callback', env.siteUrl).toString();
}

export async function startMcpConnection(headers: Headers, body: string): Promise<HttpResult> {
  return withAuthenticatedUser(
    async ({ userId }) => {
      if (!isSameOrigin(headers)) {
        return jsonResult(403, { success: false, error: 'طلب غير مسموح' });
      }

      let parsed: z.infer<typeof StartBodySchema>;
      try {
        parsed = StartBodySchema.parse(JSON.parse(body === '' ? '{}' : body));
      } catch {
        return jsonResult(400, { success: false, error: 'طلب غير صالح' });
      }

      try {
        const { authorizeUrl } = await createDefaultMcpConnectService().start({
          userId,
          registryName: parsed.registryName,
          redirectUri: mcpCallbackUrl(),
        });
        return jsonResult(
          200,
          { success: true, data: { authorizeUrl } },
          { headers: { 'Cache-Control': 'no-store' } }
        );
      } catch (error) {
        if (error instanceof McpConnectError) {
          const status = error.failure === 'plan_limit' ? 402 : 400;
          return jsonResult(status, { success: false, error: error.message });
        }
        if (error instanceof McpRemoteError) {
          return jsonResult(502, { success: false, error: error.message });
        }
        logger.warn('MCP marketplace: start failed', { error: String(error) });
        return jsonResult(500, { success: false, error: 'تعذّر بدء الربط. حاول من جديد.' });
      }
    },
    { whenFailed: { success: false, error: 'تعذّر بدء الربط.' } }
  );
}

/**
 * The provider's redirect back. It answers with a redirect in every case,
 * including failure: the member is looking at a browser tab that a stranger's
 * consent page sent them to, and a JSON body there is a dead end.
 */
export async function completeMcpConnection(params: URLSearchParams): Promise<HttpResult> {
  return withAuthenticatedUser(
    async ({ userId }) => {
      const state = params.get('state') ?? '';
      const code = params.get('code') ?? '';
      const denied = params.get('error');

      if (denied) {
        return {
          status: 303,
          redirect: appUrl(MARKETPLACE_PATH, { tab: 'apps', connect: 'denied' }),
        };
      }
      if (!state || !code) {
        return {
          status: 303,
          redirect: appUrl(MARKETPLACE_PATH, { tab: 'apps', connect: 'invalid' }),
        };
      }

      try {
        const { connectionId } = await createDefaultMcpConnectService().complete({
          userId,
          state,
          code,
        });
        // A consent that worked lands on the connection's own screen, not on the
        // list: the post-connect screen is where "on" is explained while the
        // member can still switch it down (ADR-0155, decision 9).
        return {
          status: 303,
          redirect: appUrl(`${MARKETPLACE_PATH}/${connectionId}`, { connect: 'done' }),
        };
      } catch (error) {
        const reason =
          error instanceof McpConnectError
            ? error.failure
            : error instanceof McpRemoteError
              ? error.failure
              : 'failed';
        if (!(error instanceof McpConnectError)) {
          logger.warn('MCP marketplace: callback failed', { reason, error: String(error) });
        }
        return {
          status: 303,
          redirect: appUrl(MARKETPLACE_PATH, { tab: 'apps', connect: 'error', reason }),
        };
      }
    },
    {
      // A signed-out callback lands on the screen with its own sentence rather
      // than a 401 in a browser tab the member did not open by hand.
      whenUnauthenticated: (): HttpResult => ({
        status: 303,
        redirect: appUrl(MARKETPLACE_PATH, { tab: 'apps', connect: 'signin' }),
      }),
      whenFailed: { success: false, error: 'تعذّر إتمام الربط.' },
    }
  );
}

/**
 * The member's own connections (phase 3 / #1224): the list behind the outbound
 * tab, one connection with its tools, and the four writes a screen offers.
 *
 * Reads answer with `data` or an `error`, never an empty list on failure: on a
 * permissions screen "nothing is connected" and "we could not tell you" must not
 * look the same. Writes refuse a cross-origin caller, as every account write
 * does, and an id the member does not own is a 404 rather than a permission
 * error — the two are the same answer to someone probing.
 */

/** A JSON body, parsed or `400`. Shared by the three writes below. */
function parseBody<T>(schema: z.ZodType<T>, body: string): T | null {
  try {
    const parsed = schema.safeParse(JSON.parse(body === '' ? '{}' : body));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export async function listMcpConnections(): Promise<HttpResult> {
  return withAuthenticatedUser(
    async ({ userId }) => {
      const data = await createDefaultMcpConnectionService().list(userId);
      return jsonResult(200, { success: true, data } satisfies McpConnectionListResult, {
        headers: { 'Cache-Control': 'no-store' },
      });
    },
    { whenFailed: { success: false, error: 'تعذّر تحميل التطبيقات المرتبطة.' } }
  );
}

export async function getMcpConnection(connectionId: string): Promise<HttpResult> {
  return withAuthenticatedUser(
    async ({ userId }) => {
      const connection = await createDefaultMcpConnectionService().detail(userId, connectionId);
      if (!connection) {
        return jsonResult(404, { success: false, error: 'هذا التطبيق غير مرتبط بحسابك.' });
      }
      return jsonResult(
        200,
        { success: true, data: connection } satisfies McpConnectionDetailResult,
        { headers: { 'Cache-Control': 'no-store' } }
      );
    },
    { whenFailed: { success: false, error: 'تعذّر تحميل التطبيق.' } }
  );
}

export async function updateMcpConnection(
  connectionId: string,
  headers: Headers,
  body: string
): Promise<HttpResult> {
  return withAuthenticatedUser(
    async ({ userId }) => {
      if (!isSameOrigin(headers)) {
        return jsonResult(403, { success: false, error: 'طلب غير مسموح' });
      }

      const parsed = parseBody(McpConnectionUpdateSchema, body);
      if (!parsed) {
        return jsonResult(400, { success: false, error: 'طلب غير صالح' });
      }

      const updated = await createDefaultMcpConnectionService().update(
        userId,
        connectionId,
        parsed
      );
      if (!updated) {
        return jsonResult(404, {
          success: false,
          error: 'هذا التطبيق غير مرتبط بحسابك.',
        } satisfies McpConnectionActionResult);
      }

      return jsonResult(200, { success: true } satisfies McpConnectionActionResult, {
        headers: { 'Cache-Control': 'no-store' },
      });
    },
    { whenFailed: { success: false, error: 'تعذّر حفظ التغيير.' } }
  );
}

export async function disconnectMcpConnection(
  connectionId: string,
  headers: Headers
): Promise<HttpResult> {
  return withAuthenticatedUser(
    async ({ userId }) => {
      if (!isSameOrigin(headers)) {
        return jsonResult(403, { success: false, error: 'طلب غير مسموح' });
      }

      const removed = await createDefaultMcpConnectionService().disconnect(userId, connectionId);
      if (!removed) {
        return jsonResult(404, {
          success: false,
          error: 'هذا التطبيق غير مرتبط بحسابك.',
        } satisfies McpConnectionActionResult);
      }

      return jsonResult(200, { success: true } satisfies McpConnectionActionResult);
    },
    { whenFailed: { success: false, error: 'تعذّر فصل التطبيق.' } }
  );
}

export async function updateMcpConnectionTool(
  connectionId: string,
  headers: Headers,
  body: string
): Promise<HttpResult> {
  return withAuthenticatedUser(
    async ({ userId }) => {
      if (!isSameOrigin(headers)) {
        return jsonResult(403, { success: false, error: 'طلب غير مسموح' });
      }

      const parsed = parseBody(McpConnectionToolUpdateSchema, body);
      if (!parsed) {
        return jsonResult(400, { success: false, error: 'طلب غير صالح' });
      }

      const result = await createDefaultMcpConnectionService().setTool(
        userId,
        connectionId,
        parsed.toolName,
        parsed.enabled
      );

      if (result === 'missing') {
        return jsonResult(404, {
          success: false,
          error: 'هذا التطبيق غير مرتبط بحسابك.',
        } satisfies McpConnectionActionResult);
      }
      if (result === 'unknown_tool') {
        return jsonResult(404, {
          success: false,
          error: 'هذه الأداة لم تعد في التطبيق.',
        } satisfies McpConnectionActionResult);
      }

      return jsonResult(200, { success: true } satisfies McpConnectionActionResult);
    },
    { whenFailed: { success: false, error: 'تعذّر حفظ حالة الأداة.' } }
  );
}
