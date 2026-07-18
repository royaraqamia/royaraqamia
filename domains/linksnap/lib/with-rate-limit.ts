import { NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rate-limiter';

interface RateLimitConfig {
  key: string;
  limit: number;
  windowMs: number;
  message: string;
}

export function checkRateLimitMessage(config: RateLimitConfig): string | null {
  if (!checkRateLimit(config.key, config.limit, config.windowMs)) {
    return config.message;
  }
  return null;
}

export function checkRateLimitApi(config: RateLimitConfig): NextResponse | null {
  if (!checkRateLimit(config.key, config.limit, config.windowMs)) {
    return NextResponse.json({ success: false, error: config.message }, { status: 429 });
  }
  return null;
}
