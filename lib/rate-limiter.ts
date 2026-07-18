const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

export function checkRateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const record = rateLimitMap.get(key);

  if (!record || now > record.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (record.count >= limit) return false;

  record.count++;
  return true;
}

export function getRateLimitRemaining(key: string, limit: number, _windowMs: number): number {
  const now = Date.now();
  const record = rateLimitMap.get(key);

  if (!record || now > record.resetAt) return limit;

  return Math.max(0, limit - record.count);
}
