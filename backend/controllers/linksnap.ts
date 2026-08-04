import { getAuthenticatedUser } from '@/backend/middleware/bearer-auth';
import { checkRateLimitApi } from '@/backend/middleware/http';
import { getErrorMessage } from '@/backend/shared/errors';
import { env } from '@/backend/config/env';
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
import {
  isReservedShortCode,
  ShortLinkRedirectError,
} from '@/backend/services/linksnap/redirect-url';
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

export async function listLinks(authorization: string | null): Promise<HttpResult> {
  try {
    const user = await getAuthenticatedUser(authorization);
    if (!user) {
      return jsonResult(401, UNAUTHORIZED_BODY);
    }

    const links = await createListLinksService().execute(user.id);

    return jsonResult(200, { success: true, links: links.map(linkView) });
  } catch (err: unknown) {
    console.error('Error in list links API route:', err);
    return jsonResult(500, {
      success: false,
      error: err instanceof Error ? err.message : 'حدث خطأ غير متوقع.',
    });
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

    const { code, originalUrl } = body;

    if (!code || !originalUrl) {
      return jsonResult(400, {
        success: false,
        error: "كل من 'code' و 'originalUrl' مطلوبان.",
      });
    }

    const updatedLink = await createUpdateLinkService().execute(
      code as string,
      user.id,
      originalUrl as string
    );

    return jsonResult(200, { success: true, link: linkView(updatedLink) });
  } catch (err: unknown) {
    console.error('Error in update link API route:', err);
    return jsonResult(500, {
      success: false,
      error: err instanceof Error ? err.message : 'حدث خطأ غير متوقع.',
    });
  }
}

export async function deleteLink(
  authorization: string | null,
  code: string | null
): Promise<HttpResult> {
  try {
    if (!code) {
      return jsonResult(400, { success: false, error: 'رمز الرابط مطلوب.' });
    }

    const user = await getAuthenticatedUser(authorization);
    if (!user) {
      return jsonResult(401, UNAUTHORIZED_BODY);
    }

    await createDeleteLinkService().execute(code, user.id);

    return jsonResult(200, { success: true, message: 'تم حذف الرابط بنجاح.' });
  } catch (err: unknown) {
    console.error('Error in delete link API route:', err);
    return jsonResult(500, {
      success: false,
      error: err instanceof Error ? err.message : 'حدث خطأ غير متوقع.',
    });
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

    const rateLimitKey = `shorten:${userId || ip}`;
    const limit = userId ? 50 : 5;
    const message = userId
      ? 'تم تجاوز حد الطلب: الحسابات الموثقة محدودة بـ 50 رابطًا كل 10 دقائق لمنع إساءة استخدام النظام.'
      : 'تم تجاوز حد الطلب: إنشاء الروابط للمستخدمين المجهولين محدود بـ 5 روابط كل 10 دقائق. يرجى تسجيل الدخول أو إنشاء حساب للحدود الأعلى.';
    const rateLimitResult = await checkRateLimitApi({
      key: rateLimitKey,
      limit,
      windowMs: 10 * 60 * 1000,
      message,
    });
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
    console.error('Error in shorten API route:', err);
    return jsonResult(400, { success: false, error: getErrorMessage(err) });
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

    const rateLimitResult = await checkRateLimitApi({
      key: `bulk-shorten:${user.id}`,
      limit: 10,
      windowMs: 10 * 60 * 1000,
      message:
        'تم تجاوز حد الطلب: طلبات الاختصار بالجملة محدودة بـ 10 دفعات كل 10 دقائق لحماية سلامة قاعدة البيانات.',
    });
    if (rateLimitResult) return rateLimitResult;

    const { urls } = body;

    if (!urls || !Array.isArray(urls)) {
      return jsonResult(400, {
        success: false,
        error: "يجب أن يحتوي الإدخال على مصفوفة من 'urls'.",
      });
    }

    const results = await createBulkShortenService().execute(urls, user.id);

    return jsonResult(200, { success: true, results });
  } catch (err: unknown) {
    console.error('Error in bulk shortening endpoint:', err);
    return jsonResult(500, {
      success: false,
      error: err instanceof Error ? err.message : 'حدث خطأ غير متوقع أثناء الاختصار بالجملة.',
    });
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

    const { code, isBlocked } = body;

    if (!code || typeof isBlocked !== 'boolean') {
      return jsonResult(400, {
        success: false,
        error: "كل من 'code' والقيمة المنطقية 'isBlocked' مطلوبان.",
      });
    }

    const updatedLink = await createModerateLinkService().execute(
      user.email,
      code as string,
      isBlocked
    );

    return jsonResult(200, {
      success: true,
      message: `تم ${isBlocked ? 'حظر' : 'إلغاء حظر'} الرابط بنجاح.`,
      link: {
        code: updatedLink.code,
        originalUrl: updatedLink.originalUrl,
        isBlocked: updatedLink.isBlocked,
      },
    });
  } catch (err: unknown) {
    console.error('Error in administration moderation endpoint:', err);
    return jsonResult(500, {
      success: false,
      error: err instanceof Error ? err.message : 'حدث خطأ غير متوقع أثناء المراقبة.',
    });
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
    console.error('Error in administrative stats endpoint:', err);
    return jsonResult(500, {
      success: false,
      error: err instanceof Error ? err.message : 'حدث خطأ غير متوقع.',
    });
  }
}

export async function getUrlAnalytics(
  authorization: string | null,
  code: string
): Promise<HttpResult> {
  try {
    if (!code) {
      return jsonResult(400, { success: false, error: 'رمز الرابط مطلوب.' });
    }

    const user = await getAuthenticatedUser(authorization);
    if (!user) {
      return jsonResult(401, UNAUTHORIZED_BODY);
    }

    const analytics = await createGetUrlAnalyticsService().execute(code, user.id);

    return jsonResult(200, { success: true, analytics });
  } catch (err: unknown) {
    console.error('Error in link analytics API route:', err);
    return jsonResult(500, {
      success: false,
      error: err instanceof Error ? err.message : 'حدث خطأ غير متوقع.',
    });
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
  if (isReservedShortCode(code)) {
    return jsonResult(404, null);
  }

  try {
    const originalUrl = await createRedirectUrlService().execute(code, {
      referrer: info.referrer,
      userAgent: info.userAgent,
      ipCountry: info.ipCountry,
    });

    return { status: 302, redirect: originalUrl };
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    console.error(`Redirect failed for code [${code}]:`, errorMessage);

    const baseUrl = env.appUrl || info.origin;
    const errorCode =
      err instanceof ShortLinkRedirectError && err.kind === 'blocked' ? 'blocked' : 'not-found';
    return {
      status: 302,
      redirect: `${baseUrl}/linksnap?error=${errorCode}&code=${code}`,
    };
  }
}
