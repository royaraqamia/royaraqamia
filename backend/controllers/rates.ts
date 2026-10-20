import { timingSafeEqual } from 'node:crypto';
import * as Sentry from '@sentry/nextjs';
import { env } from '@/backend/config/env';
import { createRatesService } from '@/backend/config/rates';
import { getAdminSupabase } from '@/backend/config/supabase';
import { RATES_MUTATION_TAGS } from '@/backend/shared/rates-cache-tags';
import { NO_STORE, PUBLIC_CACHEABLE } from '@/backend/transport/cache-policy';
import { jsonResult, type HttpResult } from '@/backend/transport/http-result';
import { RateSeriesQuerySchema } from '@/shared/contracts/rates';

function isAuthorized(headers: Headers): boolean {
  const expected = env.cronSecret;
  const supplied = headers.get('authorization') ?? '';
  const token = supplied.startsWith('Bearer ') ? supplied.slice('Bearer '.length) : '';
  return (
    Boolean(expected) &&
    token.length > 0 &&
    token.length === expected!.length &&
    timingSafeEqual(Buffer.from(token), Buffer.from(expected!))
  );
}

export async function refreshRates(headers: Headers): Promise<HttpResult> {
  if (!isAuthorized(headers)) {
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
