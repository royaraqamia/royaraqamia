import { getAuthUser } from '@/backend/middleware/auth-guard';
import { jsonResult, type HttpResult } from '@/backend/transport/http-result';

/**
 * Who the caller is, resolved from the session cookie.
 *
 * This exists for the background flush (ADR-0058): a service worker cannot read
 * cookies, so a flush that outlives the page cannot otherwise tell whose Outbox
 * it is looking at. Answering `null` rather than 401 for a signed-out caller is
 * deliberate — the drain then touches only the guest namespace, and an intent
 * queued under one account can never be replayed under another's session.
 */
export async function readSession(): Promise<HttpResult> {
  const { user } = await getAuthUser();
  return jsonResult(200, { userId: user?.id ?? null });
}
