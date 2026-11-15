import * as Sentry from '@sentry/nextjs';

import { NO_STORE } from '@/backend/transport/cache-policy';
import { jsonResult, type HttpResult } from '@/backend/transport/http-result';
import { createMentionsService } from '@/backend/config/users';
import { isRepositoryError } from '@/backend/shared/repository-error';
import { MentionHandlesSchema } from '@/shared/contracts/users';

/**
 * Which of the handles a screen mentions are members (ADR-0192).
 *
 * Every surface that renders conversation asks this once per batch: chat bubbles,
 * the assistant's answers, a profile bio, a note preview. It is a read, it is
 * public — the community directory already lists every handle it can answer yes
 * for — and its refusal is deliberately quiet: a failed lookup answers `200` with
 * no handles, so the caller paints the writer's text and nothing breaks. The one
 * thing this endpoint must never do is turn a typo or an outage into a link to a
 * 404.
 */
export async function resolveMentionHandles(body: unknown): Promise<HttpResult> {
  const parsed = MentionHandlesSchema.safeParse(body);
  if (!parsed.success) {
    return jsonResult(200, { handles: [] }, { headers: NO_STORE });
  }

  try {
    const handles = await createMentionsService().resolve(parsed.data.handles);
    return jsonResult(200, { handles }, { headers: NO_STORE });
  } catch (error) {
    if (!isRepositoryError(error)) Sentry.captureException(error);
    return jsonResult(200, { handles: [] }, { headers: NO_STORE });
  }
}
