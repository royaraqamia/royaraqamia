import { getAuthenticatedUser } from '@/backend/middleware/bearer-auth';
import { checkRateLimitApi } from '@/backend/middleware/http';
import { AppError, getErrorMessage } from '@/backend/shared/errors';
import { env } from '@/backend/config/env';
import { logger } from '@/backend/shared/logger';
import {
  createBulkLinkActionService,
  createBulkShortenService,
  createCheckCodeAvailabilityService,
  createDeleteLinkService,
  createGetSystemStatsService,
  createGetUrlAnalyticsService,
  createListLinksService,
  createModerateLinkService,
  createShortenUrlService,
  createUpdateLinkService,
  createRedirectUrlService,
} from '@/backend/config/linksnap';
import {
  bulkShortenRateLimitPolicy,
  shortenRateLimitPolicy,
  slugAvailabilityRateLimitPolicy,
} from '@/backend/config/rate-limiter';
import { ShortLinkRedirectError } from '@/backend/services/linksnap/redirect-url';
import { getLinkStatus } from '@/backend/services/linksnap/link-status';
import type { AnalyticsDateRange } from '@/backend/repositories/linksnap/analytics-repository';
import { jsonResult, type HttpResult } from '@/backend/transport/http-result';

function parseDate(value: unknown): Date | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new AppError('تاريخ غير صالح في معاملات الاستعلام.', 400);
  }
  return d;
}

function parseDateRange(search: URLSearchParams): AnalyticsDateRange | undefined {
  const from = parseDate(search.get('from'));
  const to = parseDate(search.get('to'));
  if (!from && !to) return undefined;
  if (from && to && from.getTime() > to.getTime()) {
    throw new AppError('تاريخ البداية يجب أن يكون قبل تاريخ النهاية.', 400);
  }
  return { from, to };
}

function parseExpiresAt(value: unknown): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) {
    throw new AppError('تاريخ انتهاء صلاحية غير صالح.', 400);
  }
  return d;
}

function linkView(l: {
  code: string;
  originalUrl: string;
  createdAt: Date;
  isBlocked: boolean;
  expiresAt: Date | null;
}) {
  return {
    code: l.code,
    originalUrl: l.originalUrl,
    createdAt: l.createdAt.toISOString(),
    isBlocked: l.isBlocked,
    expiresAt: l.expiresAt ? l.expiresAt.toISOString() : null,
    status: getLinkStatus(l.isBlocked, l.expiresAt),
  };
}

const UNAUTHORIZED_BODY = { success: false, error: 'غير مصرح. يرجى تسجيل الدخول أولاً.' };

function errorResponse(err: unknown, log: string): HttpResult {
  logger.error(log, { error: String(err) });
  const status = err instanceof AppError ? err.statusCode : 500;
  return jsonResult(status, { success: false, error: getErrorMessage(err) });
}

export async function listLinks(authorization: string | null): Promise<HttpResult> {
  try {
    const user = await getAuthenticatedUser(authorization);
    if (!user) {
      return jsonResult(401, UNAUTHORIZED_BODY);
    }

    const links = await createListLinksService().execute(user.id);

    return jsonResult(200, { success: true, links: links.map(linkView) });
  } catch (err: unknown) {
    return errorResponse(err, 'Error in list links API route:');
  }
}

export async function updateLink(
  authorization: string | null,
  body: { code?: unknown; newCode?: unknown; originalUrl?: unknown; expiresAt?: unknown }
): Promise<HttpResult> {
  try {
    const user = await getAuthenticatedUser(authorization);
    if (!user) {
      return jsonResult(401, UNAUTHORIZED_BODY);
    }

    const updatedLink = await createUpdateLinkService().execute(body.code as string, user.id, {
      code: body.newCode as string | undefined,
      originalUrl: body.originalUrl as string | undefined,
      expiresAt: parseExpiresAt(body.expiresAt),
    });

    return jsonResult(200, { success: true, link: linkView(updatedLink) });
  } catch (err: unknown) {
    return errorResponse(err, 'Error in update link API route:');
  }
}

export async function deleteLink(
  authorization: string | null,
  code: string | null
): Promise<HttpResult> {
  try {
    const user = await getAuthenticatedUser(authorization);
    if (!user) {
      return jsonResult(401, UNAUTHORIZED_BODY);
    }

    await createDeleteLinkService().execute(code ?? '', user.id);

    return jsonResult(200, { success: true, message: 'تم حذف الرابط بنجاح.' });
  } catch (err: unknown) {
    return errorResponse(err, 'Error in delete link API route:');
  }
}

export async function checkCodeAvailability(
  authorization: string | null,
  ip: string,
  code: string | null
): Promise<HttpResult> {
  try {
    const user = await getAuthenticatedUser(authorization);
    if (!user) {
      return jsonResult(401, UNAUTHORIZED_BODY);
    }

    const rateLimitResult = await checkRateLimitApi(slugAvailabilityRateLimitPolicy(ip));
    if (rateLimitResult) return rateLimitResult;

    if (!code) {
      return jsonResult(200, { success: true, availability: { code: '', available: false } });
    }

    const availability = await createCheckCodeAvailabilityService().execute(code);

    return jsonResult(200, { success: true, availability });
  } catch (err: unknown) {
    return errorResponse(err, 'Error in slug availability API route:');
  }
}

export async function shortenUrl(
  authorization: string | null,
  ip: string,
  body: { originalUrl?: unknown; customCode?: unknown; expiresAt?: unknown }
): Promise<HttpResult> {
  try {
    const { originalUrl, customCode } = body;

    const user = await getAuthenticatedUser(authorization);
    const userId = user ? user.id : null;

    const rateLimitResult = await checkRateLimitApi(shortenRateLimitPolicy(userId, ip));
    if (rateLimitResult) return rateLimitResult;

    const newLink = await createShortenUrlService().execute(
      originalUrl as string,
      userId,
      customCode as string | undefined,
      parseExpiresAt(body.expiresAt)
    );

    return jsonResult(200, {
      success: true,
      link: {
        code: newLink.code,
        originalUrl: newLink.originalUrl,
        createdAt: newLink.createdAt.toISOString(),
        userId: newLink.userId,
        expiresAt: newLink.expiresAt ? newLink.expiresAt.toISOString() : null,
        status: getLinkStatus(newLink.isBlocked, newLink.expiresAt),
      },
    });
  } catch (err: unknown) {
    return errorResponse(err, 'Error in shorten API route:');
  }
}

export async function bulkShorten(
  authorization: string | null,
  body: { urls?: unknown }
): Promise<HttpResult> {
  try {
    const user = await getAuthenticatedUser(authorization);
    if (!user) {
      return jsonResult(401, {
        success: false,
        error: 'غير مصرح. يرجى تسجيل الدخول لاستخدام الاختصار بالجملة.',
      });
    }

    const rateLimitResult = await checkRateLimitApi(bulkShortenRateLimitPolicy(user.id));
    if (rateLimitResult) return rateLimitResult;

    const results = await createBulkShortenService().execute(body.urls as string[], user.id);

    return jsonResult(200, { success: true, results });
  } catch (err: unknown) {
    return errorResponse(err, 'Error in bulk shortening endpoint:');
  }
}

export async function moderateLink(
  authorization: string | null,
  body: { code?: unknown; isBlocked?: unknown }
): Promise<HttpResult> {
  try {
    const user = await getAuthenticatedUser(authorization);
    if (!user) {
      return jsonResult(401, UNAUTHORIZED_BODY);
    }

    const updatedLink = await createModerateLinkService().execute(
      user.email,
      body.code as string,
      body.isBlocked as boolean
    );

    return jsonResult(200, {
      success: true,
      message: `تم ${body.isBlocked ? 'حظر' : 'إلغاء حظر'} الرابط بنجاح.`,
      link: {
        code: updatedLink.code,
        originalUrl: updatedLink.originalUrl,
        isBlocked: updatedLink.isBlocked,
      },
    });
  } catch (err: unknown) {
    return errorResponse(err, 'Error in administration moderation endpoint:');
  }
}

export async function getSystemStats(authorization: string | null): Promise<HttpResult> {
  try {
    const user = await getAuthenticatedUser(authorization);
    if (!user) {
      return jsonResult(401, UNAUTHORIZED_BODY);
    }

    const stats = await createGetSystemStatsService().execute(user.email);

    return jsonResult(200, { success: true, stats });
  } catch (err: unknown) {
    return errorResponse(err, 'Error in administrative stats endpoint:');
  }
}

export async function getUrlAnalytics(
  authorization: string | null,
  code: string,
  search?: URLSearchParams
): Promise<HttpResult> {
  try {
    const user = await getAuthenticatedUser(authorization);
    if (!user) {
      return jsonResult(401, UNAUTHORIZED_BODY);
    }

    const range = search ? parseDateRange(search) : undefined;

    const analytics = await createGetUrlAnalyticsService().execute(code, user.id, range);

    return jsonResult(200, { success: true, analytics });
  } catch (err: unknown) {
    return errorResponse(err, 'Error in link analytics API route:');
  }
}

export async function exportUrlAnalytics(
  authorization: string | null,
  code: string,
  search?: URLSearchParams
): Promise<HttpResult> {
  try {
    const user = await getAuthenticatedUser(authorization);
    if (!user) {
      return jsonResult(401, UNAUTHORIZED_BODY);
    }

    const range = search ? parseDateRange(search) : undefined;

    const rows = await createGetUrlAnalyticsService().exportCsv(code, user.id, range);

    return jsonResult(200, { success: true, rows });
  } catch (err: unknown) {
    return errorResponse(err, 'Error in link analytics export route:');
  }
}

export async function bulkLinkAction(
  authorization: string | null,
  body: {
    action?: unknown;
    codes?: unknown;
    expiresAt?: unknown;
  }
): Promise<HttpResult> {
  try {
    const user = await getAuthenticatedUser(authorization);
    if (!user) {
      return jsonResult(401, UNAUTHORIZED_BODY);
    }

    if (body.action !== 'delete' && body.action !== 'setExpiry') {
      throw new AppError("القيمة 'action' يجب أن تكون delete أو setExpiry.", 400);
    }

    if (!Array.isArray(body.codes) || body.codes.length === 0) {
      throw new AppError('يجب اختيار رابط واحد على الأقل.', 400);
    }
    const codes = body.codes.filter((code): code is string => typeof code === 'string');

    const expiresAt = parseExpiresAt(body.expiresAt);

    const result = await createBulkLinkActionService().execute(
      body.action,
      codes,
      user.id,
      expiresAt
    );

    return jsonResult(200, { success: true, affected: result.affected });
  } catch (err: unknown) {
    return errorResponse(err, 'Error in bulk link action route:');
  }
}

export async function redirectShortCode(
  code: string,
  info: {
    referrer: string | null;
    userAgent: string | null;
    ipCountry: string | null;
    origin: string;
  }
): Promise<HttpResult> {
  try {
    const originalUrl = await createRedirectUrlService().execute(code, {
      referrer: info.referrer,
      userAgent: info.userAgent,
      ipCountry: info.ipCountry,
    });

    return { status: 302, redirect: originalUrl };
  } catch (err: unknown) {
    if (err instanceof ShortLinkRedirectError && err.kind === 'reserved') {
      return jsonResult(404, null);
    }

    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    logger.error(`Redirect failed for code [${code}]`, { error: errorMessage });

    const baseUrl = env.appUrl || info.origin;
    const errorCode =
      err instanceof ShortLinkRedirectError && (err.kind === 'blocked' || err.kind === 'expired')
        ? err.kind
        : 'not-found';
    return {
      status: 302,
      redirect: `${baseUrl}/linksnap?error=${errorCode}&code=${code}`,
    };
  }
}
