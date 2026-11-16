import { createDefaultSkillTelemetryService } from '@/backend/config/skill-telemetry';
import { AppError, getErrorMessage } from '@/backend/shared/errors';
import { logger } from '@/backend/shared/logger';
import { NO_STORE } from '@/backend/transport/cache-policy';
import { withAdminUser } from '@/backend/transport/admin-handler';
import { jsonResult, type HttpResult } from '@/backend/transport/http-result';
import type { AgentSkillOutcomeRow } from '@/shared/contracts/agent-skill-telemetry';

/**
 * What the specialists were offered, loaded and answered with (#1449).
 *
 * One read and no write: an operator sees a tally, never a member's conversation,
 * and there is no control on this surface at all. The body is `no-store` because
 * it is another account's activity even in aggregate, and the authenticated
 * seam's header does not survive a handler that returns its own result.
 */
function adminErrorResponse(error: unknown, log: string): HttpResult {
  logger.error(log, { error: error instanceof Error ? error.message : String(error) });
  return jsonResult(
    error instanceof AppError ? error.statusCode : 500,
    { success: false, error: getErrorMessage(error) },
    { headers: NO_STORE }
  );
}

export async function listAgentSkillOutcomes(): Promise<HttpResult> {
  return withAdminUser(
    async () => {
      const skills = await createDefaultSkillTelemetryService().list();
      return jsonResult(
        200,
        { success: true, skills } satisfies { success: true; skills: AgentSkillOutcomeRow[] },
        { headers: NO_STORE }
      );
    },
    { mapError: (error) => adminErrorResponse(error, 'Failed to read specialist outcomes') }
  );
}
