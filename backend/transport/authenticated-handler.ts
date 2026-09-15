import * as Sentry from '@sentry/nextjs';
import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/backend/models/database.types';
import { jsonResult, type HttpResult } from '@/backend/transport/http-result';

/**
 * The authenticated-request seam.
 *
 * One module owns the shape every authenticated controller repeats: obtain an
 * identity, answer 401 when there is none, run the handler, and turn a thrown
 * error into a response. What varies per product — which credential is read and
 * how domain errors map to statuses — is an adapter (`session-handler.ts`,
 * `bearer-handler.ts`) and a policy, not a copy of the try/catch.
 *
 * This module deliberately imports no guard: adapters supply the identity.
 */

export interface HandlerPolicy {
  /** Response when no identity is established. Defaults to a 401 body. */
  whenUnauthenticated?: () => HttpResult;
  /** Map a thrown error to a response. `null` falls through to the failure body. */
  mapError?: (error: unknown) => HttpResult | null;
  /** Body returned for an unexpected failure. */
  whenFailed?: unknown;
}

export interface SessionIdentity {
  userId: string;
  userEmail: string;
  supabase: SupabaseClient<Database>;
}

export interface BearerIdentity {
  userId: string;
  userEmail: string;
}

const UNAUTHORIZED_BODY = { error: 'غير مصرح' };
const FAILED_BODY = { success: false, error: 'حدث خطأ غير متوقع. الرجاء المحاولة مرة أخرى.' };

export async function handleAuthenticated<Identity>(
  authenticate: () => Promise<Identity | null>,
  run: (identity: Identity) => Promise<HttpResult>,
  policy: HandlerPolicy = {}
): Promise<HttpResult> {
  let identity: Identity | null;
  try {
    identity = await authenticate();
  } catch (error) {
    Sentry.captureException(error);
    return jsonResult(500, policy.whenFailed ?? FAILED_BODY);
  }

  if (!identity) {
    return policy.whenUnauthenticated?.() ?? jsonResult(401, UNAUTHORIZED_BODY);
  }

  try {
    return await run(identity);
  } catch (error) {
    Sentry.captureException(error);
    return policy.mapError?.(error) ?? jsonResult(500, policy.whenFailed ?? FAILED_BODY);
  }
}

/**
 * Map any thrown error to `status`, using its message and falling back to
 * `fallback` for non-errors.
 */
export function messageError(status: number, fallback: string, key: 'error' | 'message' = 'error') {
  return (error: unknown): HttpResult =>
    jsonResult(status, { [key]: error instanceof Error ? error.message : fallback });
}
