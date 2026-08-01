import { NextResponse } from 'next/server';
import { checkRateLimit } from '@/backend/shared/rate-limiter';

interface RateLimitConfig {
  key: string;
  limit: number;
  windowMs: number;
  message: string;
}

export function checkRateLimitApi(config: RateLimitConfig): NextResponse | null {
  if (!checkRateLimit(config.key, config.limit, config.windowMs)) {
    return NextResponse.json({ success: false, error: config.message }, { status: 429 });
  }
  return null;
}
