import * as Sentry from '@sentry/nextjs';
import { createRatesService } from '@/backend/config/rates';
import { getAdminSupabase } from '@/backend/config/supabase';
import { isCronAuthorized } from '@/backend/shared/cron-auth';
import { loadRatesBoard } from '@/backend/loaders/rates';
import { RATES_MUTATION_TAGS } from '@/backend/shared/rates-cache-tags';
import { NO_STORE, PUBLIC_CACHEABLE } from '@/backend/transport/cache-policy';
import { jsonResult, type HttpResult } from '@/backend/transport/http-result';
import { RateSeriesQuerySchema } from '@/shared/contracts/rates';

export async function refreshRates(headers: Headers): Promise<HttpResult> {
  if (!isCronAuthorized(headers)) {
    return jsonResult(401, { success: false, error: 'غير مصرح' }, { headers: NO_STORE });
  }

  try {
    const result = await createRatesService(getAdminSupabase()).refresh();
    return jsonResult(
      200,
      { success: true, ...result },
      { tags: RATES_MUTATION_TAGS, headers: NO_STORE }
    );
  } catch (error) {
    Sentry.captureException(error);
    return jsonResult(
      500,
      {
        success: false,
        error: error instanceof Error ? error.message : 'فشل تحديث الأسعار',
      },
      { headers: NO_STORE }
    );
  }
}

export async function getRatesHealth(): Promise<HttpResult> {
  const health = await createRatesService(getAdminSupabase()).getHealth();
  return jsonResult(health.ok ? 200 : 503, health, {
    headers: health.ok ? PUBLIC_CACHEABLE : NO_STORE,
  });
}

/**
 * The board the page renders, on the route the app reads it from (#658).
 *
 * It answers the page's own cached read rather than a second query: the freshness
 * policy — refresh on read once the board is older than a few hours — is the one
 * the page already pays, and a copy of it here would be a second board that could
 * disagree with the first. The answer is the public snapshot, so it is cacheable
 * like the page itself; there is no per-visitor data in it, which is why no
 * limiter sits in front of a CDN-cached read.
 */
export async function getRatesBoard(): Promise<HttpResult> {
  const board = await loadRatesBoard();
  if (!board) {
    return jsonResult(
      503,
      { error: 'تعذَّر تحميل الأسعار حاليًّا. يُرجى المحاولة لاحقًا.' },
      { headers: NO_STORE }
    );
  }

  return jsonResult(200, board, { headers: PUBLIC_CACHEABLE });
}

export async function getRateSeries(query: URLSearchParams): Promise<HttpResult> {
  const parsed = RateSeriesQuerySchema.safeParse({
    code: query.get('code') ?? '',
    range: query.get('range') ?? undefined,
    basis: query.get('basis') ?? undefined,
  });
  if (!parsed.success) {
    return jsonResult(400, { error: 'بيانات غير صحيحة' }, { headers: NO_STORE });
  }

  const series = await createRatesService(getAdminSupabase()).getSeries(
    parsed.data.code,
    parsed.data.range,
    parsed.data.basis
  );
  if (!series) {
    return jsonResult(404, { error: 'العملة غير معروفة' }, { headers: NO_STORE });
  }

  return jsonResult(200, series, { headers: PUBLIC_CACHEABLE });
}
