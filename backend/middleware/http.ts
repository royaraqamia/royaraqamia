import { NextResponse } from 'next/server';
import { checkRateLimit, type RateLimitPolicy } from '@/backend/config/rate-limiter';

export async function checkRateLimitApi(config: RateLimitPolicy): Promise<NextResponse | null> {
  if (!(await checkRateLimit(config.key, config.limit, config.windowMs))) {
    return NextResponse.json({ success: false, error: config.message }, { status: 429 });
  }
  return null;
}
