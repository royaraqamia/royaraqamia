import { checkRateLimitApi } from '@/backend/middleware/http';
import { createPlanGate } from '@/backend/config/plans';
import { AppError, describeError, getErrorMessage } from '@/backend/shared/errors';
import { OWNED_ITEMS } from '@/shared/contracts/plans';
import { env } from '@/backend/config/env';
import { logger } from '@/backend/shared/logger';
import {
  createBulkLinkActionService,
  createCheckCodeAvailabilityService,
  createDeleteLinkService,
  createGetSystemStatsService,
  createGetUrlAnalyticsService,
  createListLinksService,
  createModerateLinkService,
  createShortenUrlService,
  createUnlockLinkService,
  createUpdateLinkService,
  createRedirectUrlService,
} from '@/backend/config/linksnap';
import {
  shortenRateLimitPolicy,
  slugAvailabilityRateLimitPolicy,
  unlockRateLimitPolicy,
} from '@/backend/config/rate-limiter';
import {
  type DeferredWork,
  ShortLinkRedirectError,
} from '@/backend/services/linksnap/redirect-url';
import { getLinkStatus } from '@/backend/services/linksnap/link-status';
import { hashAnonymousSubject } from '@/backend/services/plans/plan-gate';
import type { AnalyticsDateRange } from '@/backend/repositories/linksnap/analytics-repository';
import { jsonResult, type HttpResult } from '@/backend/transport/http-result';
import {
  resolveBearerOrSessionUser,
  withSessionOrBearerUser,
} from '@/backend/transport/session-or-bearer-handler';

/**
 * Codes that cannot exist (reserved paths, wrong alphabet) are answered here
 * and cached at the edge. Scanner traffic is a large share of the requests that
 * reach this route, and without a cache header each hit costs an invocation to
 * say "no" again.
 */
const NOT_FOUND_CACHE_HEADERS = { 'Cache-Control': 'public, s-maxage=3600' };

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
  updatedAt?: Date;
  isBlocked: boolean;
  expiresAt: Date | null;
  passwordHash?: string | null;
  clientId?: string | null;
  deletedAt?: Date | null;
}) {
  const updatedAt = l.updatedAt ?? l.createdAt;
  return {
    code: l.code,
    originalUrl: l.originalUrl,
    createdAt: l.createdAt.toISOString(),
    updatedAt: updatedAt.toISOString(),
    isBlocked: l.isBlocked,
    expiresAt: l.expiresAt ? l.expiresAt.toISOString() : null,
    passwordProtected: Boolean(l.passwordHash),
    status: getLinkStatus(l.isBlocked, l.expiresAt),
    clientId: l.clientId ?? null,
    deletedAt: l.deletedAt ? l.deletedAt.toISOString() : null,
  };
}

/** Offline create metadata for an Outbox replay (ADR-0029, ticket #167). */
function offlineCreateMeta(body: { clientId?: unknown; updatedAt?: unknown }): {
  clientId?: string;
  updatedAt?: string;
} {
  return {
    clientId: typeof body.clientId === 'string' ? body.clientId : undefined,
    updatedAt: typeof body.updatedAt === 'string' ? body.updatedAt : undefined,
  };
}

/** `deletedAt` present means the write carries a tombstone decision (null = resurrect). */
function offlineUpdateMeta(body: {
  updatedAt?: unknown;
  deletedAt?: unknown;
}): { updatedAt?: string; deletedAt?: string | null } | undefined {
  const hasUpdatedAt = typeof body.updatedAt === 'string';
  const hasDeletedAt = 'deletedAt' in body;
  if (!hasUpdatedAt && !hasDeletedAt) return undefined;
  return {
    updatedAt: hasUpdatedAt ? (body.updatedAt as string) : undefined,
    ...(hasDeletedAt ? { deletedAt: body.deletedAt === null ? null : String(body.deletedAt) } : {}),
  };
}

const UNAUTHORIZED_BODY = { success: false, error: 'غير مصرح. يرجى تسجيل الدخول أولاً.' };

function errorResponse(err: unknown, log: string): HttpResult {
  // `String(err)` printed `[object Object]` for the plain PostgREST error that
  // broke the shorten route, so the log named nothing at all (#518).
  logger.error(log, { error: describeError(err) });
  const status = err instanceof AppError ? err.statusCode : 500;
  // A plan refusal carries its code, so the client can pick the remedy rather
  // than match Arabic copy.
  const code = err instanceof AppError && err.code ? { code: err.code } : {};
  return jsonResult(status, { success: false, error: getErrorMessage(err), ...code });
}

/**
 * Wrap a handler that requires an identity — a bearer token or the session
 * cookie — mapping thrown errors per route. The cookie is the credential a
 * background realm presents (it cannot read the token), which is why LinkSnap's
 * routes accept both rather than the bearer alone.
 */
function requireUser(
  authorization: string | null,
  log: string,
  run: Parameters<typeof withSessionOrBearerUser>[1]
): Promise<HttpResult> {
  return withSessionOrBearerUser(authorization, run, {
    whenUnauthenticated: () => jsonResult(401, UNAUTHORIZED_BODY),
    mapError: (err) => errorResponse(err, log),
  });
}

export async function listLinks(authorization: string | null): Promise<HttpResult> {
  return requireUser(authorization, 'Error in list links API route:', async ({ userId }) => {
    const links = await createListLinksService().execute(userId);
    return jsonResult(200, { success: true, links: links.map(linkView) });
  });
}

/**
 * The whole owned snapshot for on-open reconciliation, tombstone-inclusive so a
 * delete made on another device lands here (ADR-0029). Display reads keep using
 * `listLinks`, which excludes tombstones.
 */
export async function listLinksForSync(authorization: string | null): Promise<HttpResult> {
  return requireUser(authorization, 'Error in list links sync API route:', async ({ userId }) => {
    const links = await createListLinksService().executeIncludingDeleted(userId);
    return jsonResult(200, { success: true, links: links.map(linkView) });
  });
}

export async function updateLink(
  authorization: string | null,
  body: {
    code?: unknown;
    newCode?: unknown;
    originalUrl?: unknown;
    expiresAt?: unknown;
    password?: unknown;
    updatedAt?: unknown;
    deletedAt?: unknown;
  }
): Promise<HttpResult> {
  return requireUser(authorization, 'Error in update link API route:', async ({ userId }) => {
    const changes = {
      code: body.newCode as string | undefined,
      originalUrl: body.originalUrl as string | undefined,
      expiresAt: parseExpiresAt(body.expiresAt),
      password:
        typeof body.password === 'string' && body.password.length > 0
          ? body.password
          : body.password === null
            ? null
            : undefined,
    };
    // Only pass offline metadata when the replay actually carries it, so the
    // online path keeps its two-argument service call shape.
    const meta = offlineUpdateMeta(body);
    const service = createUpdateLinkService();
    const updatedLink = meta
      ? await service.execute(body.code as string, userId, changes, meta)
      : await service.execute(body.code as string, userId, changes);

    return jsonResult(200, { success: true, link: linkView(updatedLink) });
  });
}

export async function deleteLink(
  authorization: string | null,
  code: string | null,
  updatedAt?: string | null
): Promise<HttpResult> {
  return requireUser(authorization, 'Error in delete link API route:', async ({ userId }) => {
    const service = createDeleteLinkService();
    if (typeof updatedAt === 'string') {
      await service.execute(code ?? '', userId, { updatedAt });
    } else {
      await service.execute(code ?? '', userId);
    }
    return jsonResult(200, { success: true, message: 'تم حذف الرَّابط بنجاح.' });
  });
}

export async function checkCodeAvailability(
  authorization: string | null,
  ip: string,
  code: string | null
): Promise<HttpResult> {
  return requireUser(authorization, 'Error in slug availability API route:', async () => {
    const rateLimitResult = await checkRateLimitApi(slugAvailabilityRateLimitPolicy(ip));
    if (rateLimitResult) return rateLimitResult;

    if (!code) {
      return jsonResult(200, { success: true, availability: { code: '', available: false } });
    }

    const availability = await createCheckCodeAvailabilityService().execute(code);

    return jsonResult(200, { success: true, availability });
  });
}

export async function shortenUrl(
  authorization: string | null,
  ip: string,
  body: {
    originalUrl?: unknown;
    customCode?: unknown;
    expiresAt?: unknown;
    password?: unknown;
    clientId?: unknown;
    updatedAt?: unknown;
  },
  visitorKey: string | null = null
): Promise<HttpResult> {
  try {
    const { originalUrl, customCode } = body;
    if (typeof originalUrl !== 'string') {
      throw new AppError('URL cannot be empty.', 400);
    }

    const user = await resolveBearerOrSessionUser(authorization);
    const userId = user ? user.id : null;

    const rateLimitResult = await checkRateLimitApi(shortenRateLimitPolicy(userId, ip));
    if (rateLimitResult) return rateLimitResult;

    const plan = createPlanGate();
    const shorten = createShortenUrlService();
    const meta = offlineCreateMeta(body);
    // The standing cap is the account's shelf. A replayed create whose row is
    // still live already holds its slot, so only a first write or a tombstone
    // revival checks the cap (ADR-0075). A visitor has a shelf of one, tagged on
    // the row and enforced by `assert_anonymous_link_cap` (ADR-0093).
    if (userId) {
      const replayed = meta.clientId ? await shorten.findByClientId(userId, meta.clientId) : null;
      if (!replayed || replayed.deletedAt) await plan.cap(userId, OWNED_ITEMS.shortLinks);
    }

    const expiresAt = parseExpiresAt(body.expiresAt);
    const password =
      typeof body.password === 'string' && body.password.length > 0 ? body.password : undefined;

    // An anonymous create also carries its owner, so the row can be counted
    // against the visitor's one-link slot. A signed-in create is owned by
    // `user_id` and needs nothing else.
    const newLink =
      userId === null
        ? await shorten.execute(
            originalUrl as string,
            null,
            customCode as string | undefined,
            expiresAt,
            password,
            meta,
            { visitorKey, ipHash: ip ? hashAnonymousSubject(ip) : null }
          )
        : await shorten.execute(
            originalUrl as string,
            userId,
            customCode as string | undefined,
            expiresAt,
            password,
            meta
          );

    return jsonResult(200, {
      success: true,
      link: {
        code: newLink.code,
        originalUrl: newLink.originalUrl,
        createdAt: newLink.createdAt.toISOString(),
        updatedAt: newLink.updatedAt.toISOString(),
        userId: newLink.userId,
        expiresAt: newLink.expiresAt ? newLink.expiresAt.toISOString() : null,
        status: getLinkStatus(newLink.isBlocked, newLink.expiresAt),
        clientId: newLink.clientId ?? null,
      },
    });
  } catch (err: unknown) {
    return errorResponse(err, 'Error in shorten API route:');
  }
}

export async function moderateLink(
  authorization: string | null,
  body: { code?: unknown; isBlocked?: unknown }
): Promise<HttpResult> {
  return requireUser(
    authorization,
    'Error in administration moderation endpoint:',
    async ({ userEmail }) => {
      const updatedLink = await createModerateLinkService().execute(
        userEmail,
        body.code as string,
        body.isBlocked as boolean
      );

      return jsonResult(200, {
        success: true,
        message: `تم ${body.isBlocked ? 'حظر' : 'إلغاء حظر'} الرَّابط بنجاح.`,
        link: {
          code: updatedLink.code,
          originalUrl: updatedLink.originalUrl,
          isBlocked: updatedLink.isBlocked,
        },
      });
    }
  );
}

export async function getSystemStats(authorization: string | null): Promise<HttpResult> {
  return requireUser(
    authorization,
    'Error in administrative stats endpoint:',
    async ({ userEmail }) => {
      const stats = await createGetSystemStatsService().execute(userEmail);
      return jsonResult(200, { success: true, stats });
    }
  );
}

export async function getUrlAnalytics(
  authorization: string | null,
  code: string,
  search?: URLSearchParams
): Promise<HttpResult> {
  return requireUser(authorization, 'Error in link analytics API route:', async ({ userId }) => {
    const range = search ? parseDateRange(search) : undefined;
    const analytics = await createGetUrlAnalyticsService().execute(code, userId, range);
    return jsonResult(200, { success: true, analytics });
  });
}

export async function exportUrlAnalytics(
  authorization: string | null,
  code: string,
  search?: URLSearchParams
): Promise<HttpResult> {
  return requireUser(authorization, 'Error in link analytics export route:', async ({ userId }) => {
    const range = search ? parseDateRange(search) : undefined;
    const rows = await createGetUrlAnalyticsService().exportCsv(code, userId, range);
    return jsonResult(200, { success: true, rows });
  });
}

export async function bulkLinkAction(
  authorization: string | null,
  body: {
    action?: unknown;
    codes?: unknown;
    expiresAt?: unknown;
  }
): Promise<HttpResult> {
  return requireUser(authorization, 'Error in bulk link action route:', async ({ userId }) => {
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
      userId,
      expiresAt
    );

    return jsonResult(200, { success: true, affected: result.affected });
  });
}

export async function redirectShortCode(
  code: string,
  info: {
    referrer: string | null;
    userAgent: string | null;
    ipCountry: string | null;
    origin: string;
  },
  defer?: DeferredWork
): Promise<HttpResult> {
  try {
    const originalUrl = await createRedirectUrlService(defer).execute(code, {
      referrer: info.referrer,
      userAgent: info.userAgent,
      ipCountry: info.ipCountry,
    });

    return { status: 302, redirect: originalUrl };
  } catch (err: unknown) {
    if (err instanceof ShortLinkRedirectError && err.kind === 'reserved') {
      return jsonResult(404, null, { headers: NOT_FOUND_CACHE_HEADERS });
    }

    // A code that cannot exist (wrong alphabet, too long) never reaches the
    // database and is not worth a render: answer the scanner with a cacheable
    // 404 instead of redirecting it into the `/linksnap` error page.
    if (err instanceof ShortLinkRedirectError && err.kind === 'invalid') {
      return jsonResult(404, null, { headers: NOT_FOUND_CACHE_HEADERS });
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
      redirect:
        err instanceof ShortLinkRedirectError && err.kind === 'password-protected'
          ? `${baseUrl}/unlock/${code}`
          : `${baseUrl}/linksnap?error=${errorCode}&code=${code}`,
    };
  }
}

export async function unlockLinkPassword(
  ip: string,
  body: { code?: unknown; password?: unknown }
): Promise<HttpResult> {
  try {
    const rateLimitResult = await checkRateLimitApi(unlockRateLimitPolicy(ip));
    if (rateLimitResult) return rateLimitResult;

    if (typeof body.code !== 'string' || typeof body.password !== 'string') {
      throw new AppError('رمز الرَّابط وكلمة المرور مطلوبان.', 400);
    }

    const originalUrl = await createUnlockLinkService().execute(body.code, body.password, {
      referrer: null,
      userAgent: null,
      ipCountry: null,
    });

    return jsonResult(200, { success: true, originalUrl });
  } catch (err: unknown) {
    // A missing or tombstoned link is a 404: the shared mapper only knows
    // `AppError`, so a redirect error would otherwise fall through to 500 (#569).
    if (err instanceof ShortLinkRedirectError && err.kind === 'not-found') {
      const code = typeof body.code === 'string' ? body.code : '';
      return jsonResult(404, {
        success: false,
        error: `الرمز المختصر /${code} غير موجود.`,
      });
    }
    return errorResponse(err, 'Error in unlock link API route:');
  }
}
