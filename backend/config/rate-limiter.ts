import {
  createRateLimiter,
  type RateLimiter,
  type RateLimiterOptions,
} from '@/backend/clients/rate-limiter';
import { env } from '@/backend/config/env';
import { logger } from '@/backend/shared/logger';

let defaultRateLimiter: RateLimiter | null = null;
let warnedMissingRedis = false;

export function getDefaultRateLimiter(): RateLimiter {
  if (!defaultRateLimiter) {
    const redisUrl = env.upstashRedisUrl;
    const redisToken = env.upstashRedisToken;

    if ((!redisUrl || !redisToken) && !warnedMissingRedis) {
      warnedMissingRedis = true;
      logger.warn(
        '[rate-limiter] UPSTASH_REDIS_REST_URL/TOKEN not configured — using per-instance in-memory limits, which are NOT shared across serverless instances (a global limit cannot be enforced).'
      );
    }

    defaultRateLimiter = createRateLimiter({ redisUrl, redisToken });
  }
  return defaultRateLimiter;
}

export function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
  options?: RateLimiterOptions
): Promise<boolean> {
  return getDefaultRateLimiter().checkRateLimit(key, limit, windowMs, options);
}

export function getRateLimitRemaining(
  key: string,
  limit: number,
  windowMs: number,
  options?: RateLimiterOptions
): Promise<number> {
  return getDefaultRateLimiter().getRateLimitRemaining(key, limit, windowMs, options);
}

export interface RateLimitPolicy {
  key: string;
  limit: number;
  windowMs: number;
  message: string;
}

const SHORTEN_WINDOW_MS = 10 * 60 * 1000;

export function shortenRateLimitPolicy(userId: string | null, ip: string): RateLimitPolicy {
  const isAuthed = userId !== null;
  return {
    key: `shorten:${userId ?? ip}`,
    limit: isAuthed ? 50 : 5,
    windowMs: SHORTEN_WINDOW_MS,
    message: isAuthed
      ? 'تم تجاوز حد الطلب: الحسابات الموثقة محدودة بـ 50 رابطًا كل 10 دقائق لمنع إساءة استخدام النظام.'
      : 'تم تجاوز حد الطلب: إنشاء الروابط للمستخدمين المجهولين محدود بـ 5 روابط كل 10 دقائق. يرجى تسجيل الدخول أو إنشاء حساب للحدود الأعلى.',
  };
}

export function slugAvailabilityRateLimitPolicy(ip: string): RateLimitPolicy {
  return {
    key: `slug-availability:${ip}`,
    limit: 60,
    windowMs: 60 * 1000,
    message: 'تم تجاوز حد الطلب: التحقق من توفر الرموز محدود بـ 60 استعلامًا في الدقيقة.',
  };
}

/**
 * Shared by the public search suggestions and feed routes: both are anonymous
 * and run a database query per request. A visitor types for a moment and then
 * reads the feed, so one bucket at 60 requests/minute is ample while still
 * capping a script.
 */
export function communitySearchRateLimitPolicy(ip: string): RateLimitPolicy {
  return {
    key: `community-search:${ip}`,
    limit: 60,
    windowMs: 60 * 1000,
    message: 'تم تجاوز حدّ الطلب: البحث في المجتمع محدود بـ 60 طلبًا في الدقيقة.',
  };
}

export function usernameAvailabilityRateLimitPolicy(userId: string): RateLimitPolicy {
  return {
    key: `username-availability:${userId}`,
    limit: 30,
    windowMs: 60 * 1000,
    message: 'تم تجاوز حدّ الطلب: التحقق من توفّر المعرِّف محدود بـ 30 استعلامًا في الدقيقة.',
  };
}

/** Avatar writes move a file through storage, so they are bounded separately. */
export function avatarUploadRateLimitPolicy(userId: string): RateLimitPolicy {
  return {
    key: `avatar-upload:${userId}`,
    limit: 10,
    windowMs: 60 * 1000,
    message: 'تم تجاوز حدّ الطلب: تحديث الصُّورة الشَّخصيَّة محدود بـ 10 مرّات في الدقيقة.',
  };
}

export function unlockRateLimitPolicy(ip: string): RateLimitPolicy {
  return {
    key: `link-unlock:${ip}`,
    limit: 15,
    windowMs: 10 * 60 * 1000,
    message: 'تم تجاوز حد الطلب: محاولات فتح الروابط محدودة بـ 15 محاولة كل 10 دقائق.',
  };
}

/**
 * Filing a news source is an outbound fetch to a host the reader chose, so it is
 * bounded per account rather than per request. One open request at a time is the
 * product rule; this is the cheaper guard against a loop that never gets that far.
 */
export function newsSourceRequestRateLimitPolicy(userId: string): RateLimitPolicy {
  return {
    key: `news-source-request:${userId}`,
    limit: 3,
    windowMs: 24 * 60 * 60 * 1000,
    message: 'تم تجاوز حدّ الطلب: إضافة مصدر محدودة بـ 3 محاولات في اليوم.',
  };
}

const DOWNLOAD_WINDOW_MS = 10 * 60 * 1000;

export function downloaderRateLimitPolicy(ip: string): RateLimitPolicy {
  return {
    key: `downloader:${ip}`,
    limit: 10,
    windowMs: DOWNLOAD_WINDOW_MS,
    message: 'تم تجاوز حدّ الطلب: تنزيل الوسائط محدود بـ 10 طلبات كل 10 دقائق.',
  };
}

/** Looser than the download path: an inspect runs on every debounced keystroke. */
export function downloaderInspectRateLimitPolicy(ip: string): RateLimitPolicy {
  return {
    key: `downloader-inspect:${ip}`,
    limit: 30,
    windowMs: DOWNLOAD_WINDOW_MS,
    message: 'تم تجاوز حدّ الطلب: فحص الروابط محدود بـ 30 طلبًا كل 10 دقائق.',
  };
}

export function adminEmailBroadcastRateLimitPolicy(adminEmail: string): RateLimitPolicy {
  return {
    key: `admin-email-broadcast:${adminEmail}`,
    limit: 5,
    windowMs: 60 * 60 * 1000,
    message: 'تم تجاوز حد الإرسال: يُسمح بإرسال البريد الجماعي 5 مرات في الساعة.',
  };
}

export function mcpDataPlaneRateLimitPolicy(ip: string): RateLimitPolicy {
  return {
    key: `mcp-data:${ip}`,
    limit: 100,
    windowMs: 60 * 1000,
    message: 'تم تجاوز حدّ الطلب: استدعاءات MCP محدودة بـ 100 طلب في الدقيقة لكل عنوان IP.',
  };
}

export function mcpRegisterRateLimitPolicy(ip: string): RateLimitPolicy {
  return {
    key: `mcp-register:${ip}`,
    limit: 10,
    windowMs: 10 * 60 * 1000,
    message: 'تم تجاوز حدّ الطلب: تسجيل عملاء MCP محدود بـ 10 طلبات كل 10 دقائق.',
  };
}

export function mcpTokenRateLimitPolicy(ip: string): RateLimitPolicy {
  return {
    key: `mcp-token:${ip}`,
    limit: 30,
    windowMs: 10 * 60 * 1000,
    message: 'تم تجاوز حدّ الطلب: تبادل رموز MCP محدود بـ 30 طلبًا كل 10 دقائق.',
  };
}

/**
 * The authorization endpoint does a client lookup on every request before the
 * browser is even signed in, so an anonymous loop with a made-up client id
 * costs a database round trip each time. Its own bucket, at the token-exchange
 * order: the browser flow's own redirects stay well inside it.
 */
export function mcpAuthorizeRateLimitPolicy(ip: string): RateLimitPolicy {
  return {
    key: `mcp-authorize:${ip}`,
    limit: 30,
    windowMs: 10 * 60 * 1000,
    message: 'تم تجاوز حدّ الطلب: طلبات تفويض MCP محدودة بـ 30 طلبًا كل 10 دقائق.',
  };
}

/**
 * RFC 7009 allows revocation without authentication, so the endpoint hashes
 * whatever it is handed and looks the row up. Its own bucket keeps that work
 * from being driven by a script at the cost of the tokens it is meant to kill.
 */
export function mcpRevokeRateLimitPolicy(ip: string): RateLimitPolicy {
  return {
    key: `mcp-revoke:${ip}`,
    limit: 30,
    windowMs: 10 * 60 * 1000,
    message: 'تم تجاوز حدّ الطلب: إلغاء رموز MCP محدود بـ 30 طلبًا كل 10 دقائق.',
  };
}

export function mcpConsentRateLimitPolicy(ip: string): RateLimitPolicy {
  return {
    key: `mcp-consent:${ip}`,
    limit: 20,
    windowMs: 10 * 60 * 1000,
    message: 'تم تجاوز حدّ الطلب: الموافقة على ربط MCP محدودة بـ 20 طلبًا كل 10 دقائق.',
  };
}

/**
 * The offline-serve beacon (ADR-0074) is sent by the service worker, so a
 * browser that is repeatedly cut off can ring it several times a minute while a
 * visitor navigates. The bucket is per IP and the endpoint is fail-closed: losing
 * a signal during a limiter outage is preferable to an unbounded write path.
 */
export function offlineServeRateLimitPolicy(ip: string): RateLimitPolicy {
  return {
    key: `offline-serve:${ip}`,
    limit: 30,
    windowMs: 60 * 1000,
    message: 'تم تجاوز حدّ الطلب: تسجيل الصفحة دون اتصال محدود بـ 30 طلبًا في الدقيقة.',
  };
}

/**
 * The launch and tap beacon (#487) is one request per launch and one per local
 * mutation, so an ordinary minute is a handful. Sixty leaves room for a rapid
 * check-in spree while still bounding a script. Per IP and fail-closed for the
 * same reason as the offline beacon: a limiter outage drops a sample, it does
 * not open a write path.
 */
export function appPerfRateLimitPolicy(ip: string): RateLimitPolicy {
  return {
    key: `app-perf:${ip}`,
    limit: 60,
    windowMs: 60 * 1000,
    message: 'تم تجاوز حدّ الطلب: قياس الأداء محدود بـ 60 طلبًا في الدقيقة.',
  };
}
