import { getAuthenticatedUser } from '@/backend/middleware/bearer-auth';
import { checkRateLimitApi } from '@/backend/middleware/http';
import { AppError, getErrorMessage } from '@/backend/shared/errors';
import { env } from '@/backend/config/env';
import { logger } from '@/shared/logger';
import {
  createBulkShortenService,
  createDeleteLinkService,
  createGetSystemStatsService,
  createGetUrlAnalyticsService,
  createListLinksService,
  createModerateLinkService,
  createShortenUrlService,
  createUpdateLinkService,
  createRedirectUrlService,
} from '@/backend/config/linksnap';
import { bulkShortenRateLimitPolicy, shortenRateLimitPolicy } from '@/backend/config/rate-limiter';
import { ShortLinkRedirectError } from '@/backend/services/linksnap/redirect-url';
import { jsonResult, type HttpResult } from '@/backend/transport/http-result';

function linkView(l: { code: string; originalUrl: string; createdAt: Date; isBlocked: boolean }) {
  return {
    code: l.code,
    originalUrl: l.originalUrl,
    createdAt: l.createdAt.toISOString(),
    isBlocked: l.isBlocked,
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
  body: { code?: unknown; originalUrl?: unknown }
): Promise<HttpResult> {
  try {
    const user = await getAuthenticatedUser(authorization);
    if (!user) {
      return jsonResult(401, UNAUTHORIZED_BODY);
    }

    const updatedLink = await createUpdateLinkService().execute(
      body.code as string,
      user.id,
      body.originalUrl as string
    );

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

export async function shortenUrl(
  authorization: string | null,
  ip: string,
  body: { originalUrl?: unknown; customCode?: unknown }
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
      customCode as string | undefined
    );

    return jsonResult(200, {
      success: true,
      link: {
        code: newLink.code,
        originalUrl: newLink.originalUrl,
        createdAt: newLink.createdAt.toISOString(),
        userId: newLink.userId,
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
  code: string
): Promise<HttpResult> {
  try {
    const user = await getAuthenticatedUser(authorization);
    if (!user) {
      return jsonResult(401, UNAUTHORIZED_BODY);
    }

    const analytics = await createGetUrlAnalyticsService().execute(code, user.id);

    return jsonResult(200, { success: true, analytics });
  } catch (err: unknown) {
    return errorResponse(err, 'Error in link analytics API route:');
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
      err instanceof ShortLinkRedirectError && err.kind === 'blocked' ? 'blocked' : 'not-found';
    return {
      status: 302,
      redirect: `${baseUrl}/linksnap?error=${errorCode}&code=${code}`,
    };
  }
}
