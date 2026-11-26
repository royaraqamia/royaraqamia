import { z } from 'zod';

import {
  completeCodingConnect,
  createCodingRunnerService,
  createCodingServiceForUser,
  resolveCodingRunner,
  startCodingConnect,
  type CodingRunnerAuth,
} from '@/backend/config/coding';
import { env } from '@/backend/config/env';
import { codingPairClaimRateLimitPolicy } from '@/backend/config/rate-limiter';
import { checkRateLimitApi, errorResultAt } from '@/backend/middleware/http';
import type { CodingService } from '@/backend/services/coding/coding-service';
import { logger } from '@/backend/shared/logger';
import { NO_STORE } from '@/backend/transport/cache-policy';
import { clientAddress, isSameOrigin } from '@/backend/transport/http';
import { jsonResult, type HttpResult } from '@/backend/transport/http-result';
import { withAuthenticatedUser } from '@/backend/transport/session-handler';
import type {
  ClaimCodingLocalPairInput,
  CodingRepoInput,
  CodingRunnerLlmRequest,
  CodingRunnerUpdate,
  CodingTaskListQuery,
  CreateCodingTaskInput,
  DecideCodingStepInput,
} from '@/shared/contracts/coding-agent';

/**
 * The coding agent's HTTP surface (ADR-0219).
 *
 * Member endpoints go through the session seam; runner endpoints never do. A
 * runner proves possession of the one-time token by sending it as a bearer, and
 * the config resolves its digest to the task it belongs to.
 */

const Id = z.string().uuid();
const mapCodingError = errorResultAt(400, 'تعذّر إكمال الطلب.');
const UNAUTHORIZED = jsonResult(401, { error: 'غير مصرح' }, { headers: NO_STORE });

function codingUrl(search: Record<string, string>): string {
  const url = new URL('/coding', env.origin);
  for (const [key, value] of Object.entries(search)) url.searchParams.set(key, value);
  return url.toString();
}

function redirectToCoding(search: Record<string, string>): HttpResult {
  return { status: 303, redirect: codingUrl(search) };
}

async function withRunner(
  headers: Headers,
  run: (auth: CodingRunnerAuth, service: CodingService) => Promise<HttpResult>
): Promise<HttpResult> {
  let auth: CodingRunnerAuth | null;
  try {
    auth = await resolveCodingRunner(headers);
  } catch {
    return UNAUTHORIZED;
  }
  if (!auth) return UNAUTHORIZED;

  try {
    const result = await run(auth, createCodingRunnerService());
    return 'redirect' in result
      ? result
      : { ...result, headers: { ...result.headers, ...NO_STORE } };
  } catch (error) {
    const mapped = mapCodingError(error);
    return { ...mapped, headers: { ...mapped.headers, ...NO_STORE } };
  }
}

export async function listCodingWorkspaces(_headers: Headers): Promise<HttpResult> {
  return withAuthenticatedUser(
    async ({ userId, supabase }) =>
      jsonResult(200, await createCodingServiceForUser(supabase).listWorkspaces(userId), {
        headers: NO_STORE,
      }),
    { mapError: mapCodingError }
  );
}

export async function listCodingRepos(_headers: Headers): Promise<HttpResult> {
  return withAuthenticatedUser(
    async ({ userId, supabase }) =>
      jsonResult(200, await createCodingServiceForUser(supabase).listAvailableRepos(userId), {
        headers: NO_STORE,
      }),
    { mapError: mapCodingError }
  );
}

export async function addCodingWorkspace(
  headers: Headers,
  input: CodingRepoInput
): Promise<HttpResult> {
  return withAuthenticatedUser(
    async ({ userId, supabase }) => {
      if (!isSameOrigin(headers)) {
        return jsonResult(403, { success: false, error: 'طلب غير مسموح' });
      }
      return jsonResult(
        200,
        await createCodingServiceForUser(supabase).addWorkspace(userId, input)
      );
    },
    { mapError: mapCodingError }
  );
}

export async function deleteCodingWorkspace(_headers: Headers, id: string): Promise<HttpResult> {
  if (!Id.safeParse(id).success) {
    return jsonResult(400, { success: false, error: 'معرّف مساحة العمل غير صالح.' });
  }
  return withAuthenticatedUser(
    async ({ userId, supabase }) => {
      await createCodingServiceForUser(supabase).removeWorkspace(userId, id);
      return jsonResult(200, { success: true });
    },
    { mapError: mapCodingError }
  );
}

export async function listCodingTasks(
  _headers: Headers,
  query: CodingTaskListQuery
): Promise<HttpResult> {
  return withAuthenticatedUser(
    async ({ userId, supabase }) =>
      jsonResult(200, await createCodingServiceForUser(supabase).listTasks(userId, query), {
        headers: NO_STORE,
      }),
    { mapError: mapCodingError }
  );
}

export async function createCodingTask(
  headers: Headers,
  input: CreateCodingTaskInput
): Promise<HttpResult> {
  return withAuthenticatedUser(
    async ({ userId, supabase }) => {
      if (!isSameOrigin(headers)) {
        return jsonResult(403, { success: false, error: 'طلب غير مسموح' });
      }
      return jsonResult(201, await createCodingServiceForUser(supabase).createTask(userId, input));
    },
    { mapError: mapCodingError }
  );
}

export async function getCodingTask(_headers: Headers, id: string): Promise<HttpResult> {
  if (!Id.safeParse(id).success) {
    return jsonResult(400, { success: false, error: 'معرّف المهمة غير صالح.' });
  }
  return withAuthenticatedUser(
    async ({ userId, supabase }) =>
      jsonResult(200, await createCodingServiceForUser(supabase).getTask(userId, id), {
        headers: NO_STORE,
      }),
    { mapError: mapCodingError }
  );
}

export async function cancelCodingTask(headers: Headers, id: string): Promise<HttpResult> {
  if (!Id.safeParse(id).success) {
    return jsonResult(400, { success: false, error: 'معرّف المهمة غير صالح.' });
  }
  return withAuthenticatedUser(
    async ({ userId, supabase }) => {
      if (!isSameOrigin(headers)) {
        return jsonResult(403, { success: false, error: 'طلب غير مسموح' });
      }
      return jsonResult(200, await createCodingServiceForUser(supabase).cancelTask(userId, id));
    },
    { mapError: mapCodingError }
  );
}

export async function decideCodingStep(
  headers: Headers,
  taskId: string,
  stepId: string,
  input: DecideCodingStepInput
): Promise<HttpResult> {
  if (!Id.safeParse(taskId).success || !Id.safeParse(stepId).success) {
    return jsonResult(400, { success: false, error: 'معرّف الخطوة غير صالح.' });
  }
  return withAuthenticatedUser(
    async ({ userId, supabase }) => {
      if (!isSameOrigin(headers)) {
        return jsonResult(403, { success: false, error: 'طلب غير مسموح' });
      }
      return jsonResult(
        200,
        await createCodingServiceForUser(supabase).decideStep(userId, taskId, stepId, input)
      );
    },
    { mapError: mapCodingError }
  );
}

/** Runner: read the task spec and the member's latest decision. */
export async function getRunnerTask(headers: Headers): Promise<HttpResult> {
  return withRunner(headers, async ({ rawToken }, service) =>
    jsonResult(200, await service.runnerTask(rawToken), { headers: NO_STORE })
  );
}

/** Runner: checkpoint a step and add its token usage. */
export async function updateRunnerTask(
  headers: Headers,
  update: CodingRunnerUpdate
): Promise<HttpResult> {
  return withRunner(headers, async ({ rawToken }, service) => {
    await service.runnerUpdate(rawToken, update);
    return jsonResult(200, { success: true });
  });
}

/** Runner: one model answer through the control plane's key. */
export async function llmForRunner(
  headers: Headers,
  request: CodingRunnerLlmRequest
): Promise<HttpResult> {
  return withRunner(headers, async ({ rawToken }, service) =>
    jsonResult(200, await service.runnerLlm(rawToken, request))
  );
}

/** The local companion's member surface: a code now, a grant row afterwards. */
export async function createCodingLocalPair(
  headers: Headers,
  input: { deviceLabel: string }
): Promise<HttpResult> {
  return withAuthenticatedUser(
    async ({ userId, supabase }) => {
      if (!isSameOrigin(headers)) {
        return jsonResult(403, { success: false, error: 'طلب غير مسموح' });
      }
      return jsonResult(
        200,
        await createCodingServiceForUser(supabase).createLocalPair(userId, input),
        { headers: NO_STORE }
      );
    },
    { mapError: mapCodingError }
  );
}

export async function listCodingLocalGrants(_headers: Headers): Promise<HttpResult> {
  return withAuthenticatedUser(
    async ({ userId, supabase }) =>
      jsonResult(200, await createCodingServiceForUser(supabase).listLocalGrants(userId), {
        headers: NO_STORE,
      }),
    { mapError: mapCodingError }
  );
}

export async function revokeCodingLocalGrant(headers: Headers, id: string): Promise<HttpResult> {
  if (!Id.safeParse(id).success) {
    return jsonResult(400, { success: false, error: 'معرّف الجهاز غير صالح.' });
  }
  return withAuthenticatedUser(
    async ({ userId, supabase }) => {
      if (!isSameOrigin(headers)) {
        return jsonResult(403, { success: false, error: 'طلب غير مسموح' });
      }
      await createCodingServiceForUser(supabase).revokeLocalGrant(userId, id);
      return jsonResult(200, { success: true });
    },
    { mapError: mapCodingError }
  );
}

/** A bearer on this route is a device grant, not a task callback. */
function bearerToken(headers: Headers): string | null {
  const match = /^Bearer\s+(.+)$/i.exec((headers.get('authorization') ?? '').trim());
  const raw = match?.[1]?.trim() ?? '';
  return raw.length >= 20 ? raw : null;
}

/**
 * The companion's two unauthenticated doors. Neither takes a session: the
 * one-time pairing code and the revocable grant token are the credentials, and
 * both are hashed at rest.
 */
export async function claimCodingLocalPair(
  headers: Headers,
  input: ClaimCodingLocalPairInput
): Promise<HttpResult> {
  const limited = await checkRateLimitApi(codingPairClaimRateLimitPolicy(clientAddress(headers)));
  if (limited) {
    return 'redirect' in limited
      ? limited
      : { ...limited, headers: { ...limited.headers, ...NO_STORE } };
  }
  try {
    const result = await createCodingRunnerService().claimLocalPair(input);
    return { ...jsonResult(200, result), headers: { ...NO_STORE } };
  } catch (error) {
    const mapped = mapCodingError(error);
    return { ...mapped, headers: { ...mapped.headers, ...NO_STORE } };
  }
}

export async function claimCodingLocalTask(headers: Headers): Promise<HttpResult> {
  const raw = bearerToken(headers);
  if (!raw) return UNAUTHORIZED;
  try {
    const task = await createCodingRunnerService().claimLocalTask(raw);
    return task
      ? { ...jsonResult(200, task), headers: { ...NO_STORE } }
      : { ...jsonResult(200, null), headers: { ...NO_STORE } };
  } catch (error) {
    const mapped = mapCodingError(error);
    return { ...mapped, headers: { ...mapped.headers, ...NO_STORE } };
  }
}

/** GitHub App connect: start and callback. No token ever enters a URL. */
export async function startCodingConnectHandler(headers: Headers): Promise<HttpResult> {
  return withAuthenticatedUser(
    async ({ userId }) => {
      if (!isSameOrigin(headers)) {
        return jsonResult(403, { success: false, error: 'طلب غير مسموح' });
      }
      return jsonResult(200, await startCodingConnect(userId), { headers: NO_STORE });
    },
    { mapError: mapCodingError }
  );
}

export async function finishCodingConnect(params: URLSearchParams): Promise<HttpResult> {
  return withAuthenticatedUser(
    async ({ userId }) => {
      const state = params.get('state') ?? '';
      const code = params.get('code') ?? '';
      if (params.get('error')) return redirectToCoding({ error: 'denied' });
      if (!state || !code) return redirectToCoding({ error: 'invalid' });

      try {
        await completeCodingConnect(userId, state, code);
        return redirectToCoding({ connected: '1' });
      } catch (error) {
        logger.warn('Coding connect callback failed', { error: String(error) });
        return redirectToCoding({ error: 'failed' });
      }
    },
    {
      whenUnauthenticated: () => redirectToCoding({ error: 'signin' }),
      mapError: () => redirectToCoding({ error: 'failed' }),
    }
  );
}
