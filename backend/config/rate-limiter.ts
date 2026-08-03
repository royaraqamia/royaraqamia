import { createRateLimiter, type RateLimiter } from '@/backend/clients/rate-limiter';
import { env } from '@/backend/config/env';

let defaultRateLimiter: RateLimiter | null = null;

export function getDefaultRateLimiter(): RateLimiter {
  if (!defaultRateLimiter) {
    defaultRateLimiter = createRateLimiter({
      redisUrl: env.upstashRedisUrl,
      redisToken: env.upstashRedisToken,
    });
  }
  return defaultRateLimiter;
}

export function checkRateLimit(key: string, limit: number, windowMs: number): Promise<boolean> {
  return getDefaultRateLimiter().checkRateLimit(key, limit, windowMs);
}

export function getRateLimitRemaining(
  key: string,
  limit: number,
  windowMs: number
): Promise<number> {
  return getDefaultRateLimiter().getRateLimitRemaining(key, limit, windowMs);
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

export function bulkShortenRateLimitPolicy(userId: string): RateLimitPolicy {
  return {
    key: `bulk-shorten:${userId}`,
    limit: 10,
    windowMs: SHORTEN_WINDOW_MS,
    message:
      'تم تجاوز حد الطلب: طلبات الاختصار بالجملة محدودة بـ 10 دفعات كل 10 دقائق لحماية سلامة قاعدة البيانات.',
  };
}
