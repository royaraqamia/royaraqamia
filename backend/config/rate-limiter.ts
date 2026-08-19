import { createRateLimiter, type RateLimiter } from '@/backend/clients/rate-limiter';
import type { RateLimiterOptions } from '@/backend/clients/rate-limiter';
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

export function bulkShortenRateLimitPolicy(userId: string): RateLimitPolicy {
  return {
    key: `bulk-shorten:${userId}`,
    limit: 10,
    windowMs: SHORTEN_WINDOW_MS,
    message:
      'تم تجاوز حد الطلب: طلبات الاختصار بالجملة محدودة بـ 10 دفعات كل 10 دقائق لحماية سلامة قاعدة البيانات.',
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

export function adminEmailBroadcastRateLimitPolicy(adminEmail: string): RateLimitPolicy {
  return {
    key: `admin-email-broadcast:${adminEmail}`,
    limit: 5,
    windowMs: 60 * 60 * 1000,
    message: 'تم تجاوز حد الإرسال: يُسمح بإرسال البريد الجماعي 5 مرات في الساعة.',
  };
}
