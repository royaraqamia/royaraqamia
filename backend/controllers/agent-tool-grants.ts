import { createSupabaseAgentToolGrantService } from '@/backend/config/chat';
import { AppError } from '@/backend/shared/errors';
import { NO_STORE } from '@/backend/transport/cache-policy';
import { isSameOrigin } from '@/backend/transport/http';
import { jsonResult, type HttpResult } from '@/backend/transport/http-result';
import { withAuthenticatedUser } from '@/backend/transport/session-handler';
import {
  AgentToolGrantRequestSchema,
  type AgentToolGrantListResult,
  type AgentToolGrantResult,
} from '@/shared/contracts/agent-tool-grants';

/**
 * The member's trust settings for the assistant's tools (ADR-0180, #1438).
 *
 * Three handlers: the live grants and what may be granted, one grant, and one
 * revocation. The tier check, the "seen it run once" precondition and the
 * unique live pair are the service's and the database's; this file parses,
 * refuses a cross-origin write, calls once and shapes the answer.
 */

const CROSS_ORIGIN_REFUSAL = 'طلب من أصل غير معروف.';
const INVALID_REQUEST = 'الطلب غير مكتمل.';
const FAILED = 'تعذّر إتمام الطلب. الرجاء المحاولة مرة أخرى.';

function grantFailure(fallback: string) {
  return (error: unknown): HttpResult => {
    if (error instanceof AppError) {
      return jsonResult(error.statusCode, { success: false, error: error.message });
    }
    return jsonResult(500, { success: false, error: fallback });
  };
}

export async function readAgentToolGrants(): Promise<HttpResult> {
  return withAuthenticatedUser(
    async ({ userId, supabase }) => {
      const { grants, grantable } =
        await createSupabaseAgentToolGrantService(supabase).list(userId);
      const body: AgentToolGrantListResult = { success: true, grants, grantable };
      return jsonResult(200, body, { headers: NO_STORE });
    },
    { mapError: grantFailure(FAILED) }
  );
}

export async function grantAgentTool(
  body: Record<string, unknown>,
  headers: Headers
): Promise<HttpResult> {
  return withAuthenticatedUser(
    async ({ userId, supabase }) => {
      if (!isSameOrigin(headers)) {
        return jsonResult(403, { success: false, error: CROSS_ORIGIN_REFUSAL });
      }

      const parsed = AgentToolGrantRequestSchema.safeParse(body);
      if (!parsed.success) {
        return jsonResult(400, { success: false, error: INVALID_REQUEST });
      }

      const grant = await createSupabaseAgentToolGrantService(supabase).grant(
        userId,
        parsed.data.toolId,
        'settings'
      );
      const answer: AgentToolGrantResult = { success: true, grant };
      return jsonResult(200, answer, { headers: NO_STORE });
    },
    { mapError: grantFailure(FAILED) }
  );
}

export async function revokeAgentTool(id: string, headers: Headers): Promise<HttpResult> {
  return withAuthenticatedUser(
    async ({ userId, supabase }) => {
      if (!isSameOrigin(headers)) {
        return jsonResult(403, { success: false, error: CROSS_ORIGIN_REFUSAL });
      }

      await createSupabaseAgentToolGrantService(supabase).revoke(userId, id);
      const answer: AgentToolGrantResult = { success: true };
      return jsonResult(200, answer, { headers: NO_STORE });
    },
    { mapError: grantFailure(FAILED) }
  );
}
