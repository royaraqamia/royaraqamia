import {
  createNewsCatalogueFor,
  createNewsPreferencesServiceFor,
  createNewsPrivateSourcesServiceFor,
  createNewsSourceRequestsServiceFor,
} from '@/backend/config/news';
import { createUsageService } from '@/backend/config/plans';
import { checkRateLimitApi } from '@/backend/middleware/http';
import { newsSourceRequestRateLimitPolicy } from '@/backend/config/rate-limiter';
import { AppError, getErrorMessage } from '@/backend/shared/errors';
import { logger } from '@/backend/shared/logger';
import { messageError } from '@/backend/transport/authenticated-handler';
import { isSameOrigin } from '@/backend/transport/http';
import { jsonResult, type HttpResult } from '@/backend/transport/http-result';
import { withAuthenticatedUser } from '@/backend/transport/session-handler';
import { PLAN_QUOTAS } from '@/shared/contracts/plans';
import { newsSourcePreferencesSchema, newsSourceRequestSchema } from '@/shared/contracts/news';

/** A refusal the form can show as-is, with the status the service chose for it. */
function serviceErrorResponse(error: unknown, log: string): HttpResult {
  logger.warn(log, { error: error instanceof Error ? error.message : String(error) });
  return jsonResult(error instanceof AppError ? error.statusCode : 500, {
    success: false,
    error: getErrorMessage(error),
  });
}

/**
 * The reader's news-source selection, for `/account/news`.
 *
 * A read and a write over one table, behind a session: the catalogue is public
 * but which sources an account kept is not, and returning both in one call is
 * what lets the settings page stay a data-free shell (ADR-0031).
 */
export async function getMyNewsSources(): Promise<HttpResult> {
  return withAuthenticatedUser(
    async ({ userId, supabase }) => {
      const service = createNewsPreferencesServiceFor(supabase);
      const [sources, preferences] = await Promise.all([
        createNewsCatalogueFor(supabase).list(),
        service.get(userId),
      ]);

      return jsonResult(200, {
        success: true,
        sources,
        selected: preferences.sourceIds,
        personalEnabled: preferences.personalEnabled,
      });
    },
    { mapError: messageError(500, 'تعذّر تحميل مصادر الأخبار.') }
  );
}

export async function updateMyNewsSources(body: unknown, headers: Headers): Promise<HttpResult> {
  return withAuthenticatedUser(
    async ({ userId, supabase }) => {
      if (!isSameOrigin(headers)) {
        return jsonResult(403, { success: false, error: 'طلب غير مسموح' });
      }

      const parsed = newsSourcePreferencesSchema.safeParse(body);
      if (!parsed.success) {
        return jsonResult(400, { success: false, error: 'اختيار غير صالح.' });
      }

      // The plan caps how many sources a selection may hold (ADR-0093). The
      // trigger on `news_source_preferences` is the enforcement — this is the
      // readable refusal before the write is attempted.
      const quota = await createUsageService().quotaCap(userId, PLAN_QUOTAS.newsSources);
      if (!quota.unlimited && parsed.data.sourceIds.length > quota.cap) {
        return jsonResult(402, {
          success: false,
          code: 'usage_limit',
          error: `يمكنك اختيار ${quota.cap} مصادر كحدّ أقصى في خطتك الحالية.`,
        });
      }

      const preferences = await createNewsPreferencesServiceFor(supabase).save(userId, {
        sourceIds: parsed.data.sourceIds,
        personalEnabled: parsed.data.personalEnabled,
      });

      return jsonResult(200, {
        success: true,
        selected: preferences.sourceIds,
        personalEnabled: preferences.personalEnabled,
      });
    },
    { mapError: messageError(500, 'تعذّر حفظ مصادر الأخبار.') }
  );
}

/** The proposals this reader filed, newest first. */
export async function getMyNewsSourceRequests(): Promise<HttpResult> {
  return withAuthenticatedUser(
    async ({ userId, supabase }) => {
      const requests = await createNewsSourceRequestsServiceFor(supabase).listMine(userId);
      return jsonResult(200, { success: true, requests });
    },
    { mapError: messageError(500, 'تعذّر تحميل طلباتك.') }
  );
}

/**
 * The feeds this reader added (ADR-0106): their own list, with the health the
 * digest fetch reported, and the plan's ceiling.
 *
 * The ceiling travels with the list because it is the one place a reader has to
 * see "1 من 1" before they try to add a second.
 */
export async function getMyNewsPrivateSources(): Promise<HttpResult> {
  return withAuthenticatedUser(
    async ({ userId, supabase }) => {
      const summary = await createNewsPrivateSourcesServiceFor(supabase).list(userId);
      return jsonResult(200, { success: true, ...summary });
    },
    { mapError: messageError(500, 'تعذّر تحميل مصادرك.') }
  );
}

/** Removes one of the reader's own sources; the row is theirs by policy. */
export async function deleteMyNewsPrivateSource(id: string, headers: Headers): Promise<HttpResult> {
  return withAuthenticatedUser(
    async ({ userId, supabase }) => {
      if (!isSameOrigin(headers)) {
        return jsonResult(403, { success: false, error: 'طلب غير مسموح' });
      }

      if (!id) return jsonResult(404, { success: false, error: 'هذا المصدر غير موجود.' });

      await createNewsPrivateSourcesServiceFor(supabase).remove(userId, id);
      return jsonResult(200, { success: true });
    },
    {
      mapError: (error) => serviceErrorResponse(error, 'Failed to remove a private news source'),
    }
  );
}

/**
 * Propose a source, whatever kind of link it is.
 *
 * The row is written immediately and answered with 202: the reader is not made
 * to wait for a fetch of a host they chose, and the resolver worker turns the
 * URL into a feed afterwards (ADR-0105). The rate limit is still per account,
 * because that queue is what the worker spends its outbound requests on.
 */
export async function submitNewsSourceRequest(
  body: unknown,
  headers: Headers
): Promise<HttpResult> {
  return withAuthenticatedUser(
    async ({ userId, supabase }) => {
      if (!isSameOrigin(headers)) {
        return jsonResult(403, { success: false, error: 'طلب غير مسموح' });
      }

      const rateLimited = await checkRateLimitApi(newsSourceRequestRateLimitPolicy(userId));
      if (rateLimited) return rateLimited;

      const parsed = newsSourceRequestSchema.safeParse(body);
      if (!parsed.success) {
        return jsonResult(400, { success: false, error: 'تحقَّق من الرابط والاسم.' });
      }

      const request = await createNewsSourceRequestsServiceFor(supabase).submit(
        userId,
        parsed.data
      );
      return jsonResult(202, { success: true, request });
    },
    {
      mapError: (error) => serviceErrorResponse(error, 'Failed to file a news source request'),
    }
  );
}
