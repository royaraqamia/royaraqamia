import * as Sentry from '@sentry/nextjs';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { createClient } from '@supabase/supabase-js';
import type { Database, Tables } from '@/lib/supabase/database.types';

// ============================================================
// Certificate Code Format: COMP-YYYY-XXXXXXXX (8 alphanumeric chars)
// Example: COMP-2026-A1B2C3D4
// Total length: 22 characters
// Space: 32^8 = ~1.1 trillion combinations
// ============================================================

const CERT_CODE_REGEX = /^COMP-\d{4}-[A-Z0-9]{8}$/;

// ============================================================
// Upstash Redis Rate Limiting
// Persists across cold starts, works with serverless functions
// ============================================================

const redis =
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
    ? new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      })
    : null;

// 20 requests per 60 seconds per IP
const ipLimiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(20, '60 s'),
      analytics: true,
    })
  : null;

// 5 requests per 60 seconds per code (anti-enumeration)
const codeLimiter = redis
  ? new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(5, '60 s'),
      analytics: true,
    })
  : null;

// Fallback in-memory limiter when Redis is not configured
const memoryStore = new Map<string, { count: number; resetAt: number }>();

function checkMemoryLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const record = memoryStore.get(key);

  if (!record || now > record.resetAt) {
    memoryStore.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (record.count >= limit) return false;
  record.count++;
  return true;
}

async function checkRateLimit(identifier: string, type: 'ip' | 'code'): Promise<boolean> {
  const limiter = type === 'ip' ? ipLimiter : codeLimiter;

  if (limiter) {
    try {
      const { success } = await limiter.limit(identifier);
      return success;
    } catch (e) {
      Sentry.captureException(e, {
        extra: { identifier, type },
      });
      // Fail open — allow the request if rate limiting is unreachable
      return true;
    }
  }

  // Fallback to in-memory when Upstash is not configured
  const limit = type === 'ip' ? 20 : 5;
  return checkMemoryLimit(`${type}:${identifier}`, limit, 60_000);
}

/**
 * Creates a Supabase client using the publishable (anon) key.
 * Certificate verification is a public, read-only operation — the
 * certificates table has an explicit RLS policy allowing public SELECT,
 * so the service role key is not needed and should not be used here.
 */
function createVerificationClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url) {
    throw new Error('[createVerificationClient] Missing env var: NEXT_PUBLIC_SUPABASE_URL');
  }
  if (!publishableKey) {
    throw new Error(
      '[createVerificationClient] Missing env var: NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'
    );
  }

  return createClient<Database>(url, publishableKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

export type Certificate = Tables<'certificates'>;

export interface VerifyResult {
  success: boolean;
  certificate?: Certificate;
  error?: string;
  rateLimited?: boolean;
}

/**
 * Validates certificate code format and queries Supabase.
 * Returns structured result with Sentry logging for monitoring.
 */
export async function verifyCertificateByCode(code: string, ip: string): Promise<VerifyResult> {
  try {
    const sanitized = code.trim().toUpperCase();

    // Format validation
    if (!CERT_CODE_REGEX.test(sanitized)) {
      Sentry.captureMessage('Invalid certificate code format', {
        level: 'warning',
        extra: { code: sanitized, ip },
      });
      return {
        success: false,
        error: 'صيغة الرمز غير صالحة. الصيغة الصحيحة: COMP-YYYY-XXXXXXXX',
      };
    }

    // Rate limiting - IP level
    if (!(await checkRateLimit(`verify:${ip}`, 'ip'))) {
      Sentry.captureMessage('Certificate verification IP rate limit exceeded', {
        level: 'warning',
        extra: { code: sanitized, ip },
      });
      return {
        success: false,
        error: 'تم تجاوز الحد المسموح. الرجاء المحاولة بعد دقيقة.',
        rateLimited: true,
      };
    }

    // Rate limiting - Code level (anti-enumeration)
    if (!(await checkRateLimit(`verify:${sanitized}`, 'code'))) {
      Sentry.captureMessage('Certificate verification code rate limit exceeded', {
        level: 'warning',
        extra: { code: sanitized, ip },
      });
      return {
        success: false,
        error: 'تم تجاوز الحد المسموح. الرجاء المحاولة بعد دقيقة.',
        rateLimited: true,
      };
    }

    // Database lookup — uses publishable key, not service role
    const client = createVerificationClient();
    const { data, error } = await client
      .from('certificates')
      .select('*')
      .eq('certificate_code', sanitized)
      .single();

    if (error || !data) {
      Sentry.captureMessage('Certificate not found', {
        level: 'info',
        extra: { code: sanitized, ip },
      });
      return {
        success: false,
        error: 'لم يتم العثور على شهادة بهذا الرمز أو أن الرمز غير صالح.',
      };
    }

    Sentry.captureMessage('Certificate verified successfully', {
      level: 'info',
      extra: { code: sanitized, student: data.student_name, ip },
    });

    return { success: true, certificate: data };
  } catch (e) {
    console.error('[verifyCertificateByCode] Unexpected error:', e);
    Sentry.captureException(e, {
      extra: { code, ip, source: 'verifyCertificateByCode' },
    });
    return {
      success: false,
      error: 'حدث خطأ غير متوقع. الرجاء المحاولة مرة أخرى.',
    };
  }
}
