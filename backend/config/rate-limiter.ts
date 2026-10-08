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

export function unlockRateLimitPolicy(ip: string): RateLimitPolicy {
  return {
    key: `link-unlock:${ip}`,
    limit: 15,
    windowMs: 10 * 60 * 1000,
    message: 'تم تجاوز حد الطلب: محاولات فتح الروابط محدودة بـ 15 محاولة كل 10 دقائق.',
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

export function mcpConsentRateLimitPolicy(ip: string): RateLimitPolicy {
  return {
    key: `mcp-consent:${ip}`,
    limit: 20,
    windowMs: 10 * 60 * 1000,
    message: 'تم تجاوز حدّ الطلب: الموافقة على ربط MCP محدودة بـ 20 طلبًا كل 10 دقائق.',
  };
}
