import { NextResponse } from 'next/server';
import { checkRateLimit } from '@/backend/clients/rate-limiter';

interface RateLimitConfig {
  key: string;
  limit: number;
  windowMs: number;
  message: string;
}

export async function checkRateLimitApi(config: RateLimitConfig): Promise<NextResponse | null> {
  if (!(await checkRateLimit(config.key, config.limit, config.windowMs))) {
    return NextResponse.json({ success: false, error: config.message }, { status: 429 });
  }
  return null;
}
