import { describe, it, expect, vi, afterEach } from 'vitest';

import { createRateLimiter } from '@/backend/clients/rate-limiter';
import * as policies from '@/backend/config/rate-limiter';

const IP = '203.0.113.7';

/**
 * Every factory in the composition root, with representative arguments. A new
 * policy that omits `failClosed` fails the type check; one that opts out fails
 * this list. The unlock throttle is here because it is the only guard on
 * guessing a password-protected short link's password.
 */
const POLICY_FACTORIES = [
  ['shorten', () => policies.shortenRateLimitPolicy(null, IP)],
  ['slug availability', () => policies.slugAvailabilityRateLimitPolicy(IP)],
  ['community search', () => policies.communitySearchRateLimitPolicy(IP)],
  ['community engagement', () => policies.communityEngagementRateLimitPolicy(IP)],
  ['news search', () => policies.newsSearchRateLimitPolicy(IP)],
  ['news board', () => policies.newsBoardRateLimitPolicy(IP)],
  ['username availability', () => policies.usernameAvailabilityRateLimitPolicy('user-1')],
  ['avatar upload', () => policies.avatarUploadRateLimitPolicy('user-1')],
  ['home services', () => policies.homeServicesRateLimitPolicy('user-1')],
  ['scan history', () => policies.scanHistoryRateLimitPolicy('user-1')],
  ['unlock', () => policies.unlockRateLimitPolicy(IP)],
  ['news source request', () => policies.newsSourceRequestRateLimitPolicy('user-1')],
  ['admin broadcast', () => policies.adminEmailBroadcastRateLimitPolicy('admin@example.com')],
  ['MCP data plane', () => policies.mcpDataPlaneRateLimitPolicy(IP)],
  ['MCP register', () => policies.mcpRegisterRateLimitPolicy(IP)],
  ['MCP token', () => policies.mcpTokenRateLimitPolicy(IP)],
  ['MCP authorize', () => policies.mcpAuthorizeRateLimitPolicy(IP)],
  ['MCP revoke', () => policies.mcpRevokeRateLimitPolicy(IP)],
  ['MCP consent', () => policies.mcpConsentRateLimitPolicy(IP)],
  ['MCP marketplace start', () => policies.mcpMarketplaceStartRateLimitPolicy(IP)],
  ['MCP marketplace search', () => policies.mcpMarketplaceSearchRateLimitPolicy(IP)],
  ['MCP marketplace icon', () => policies.mcpMarketplaceIconRateLimitPolicy(IP)],
  ['offline serve', () => policies.offlineServeRateLimitPolicy(IP)],
  ['app perf', () => policies.appPerfRateLimitPolicy(IP)],
  ['app failure', () => policies.appFailureRateLimitPolicy(IP)],
] as const;

afterEach(() => {
  vi.unstubAllGlobals();
});

function limiterWithFailingStore() {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('store unreachable')));
  return createRateLimiter({
    redisUrl: 'https://test.upstash.io',
    redisToken: 'test-token',
  });
}

describe('rate-limit policies', () => {
  it.each(POLICY_FACTORIES)('%s refuses on an outage', (_name, makePolicy) => {
    expect(makePolicy().failClosed).toBe(true);
  });

  it('refuses the unlock throttle when the counter cannot be read', async () => {
    const policy = policies.unlockRateLimitPolicy(IP);
    const allowed = await limiterWithFailingStore().checkRateLimit(
      policy.key,
      policy.limit,
      policy.windowMs,
      { failClosed: policy.failClosed }
    );

    expect(allowed).toBe(false);
  });

  it('refuses the MCP authorize throttle when the counter cannot be read', async () => {
    const policy = policies.mcpAuthorizeRateLimitPolicy(IP);
    const allowed = await limiterWithFailingStore().checkRateLimit(
      policy.key,
      policy.limit,
      policy.windowMs,
      { failClosed: policy.failClosed }
    );

    expect(allowed).toBe(false);
  });

  it('keeps two addresses behind the same edge in distinct buckets', async () => {
    const limiter = createRateLimiter();
    const policy = policies.unlockRateLimitPolicy(IP);
    const firstKey = policy.key.replace(IP, '198.51.100.10');
    const secondKey = policy.key.replace(IP, '198.51.100.11');

    expect(
      await limiter.checkRateLimit(firstKey, 2, policy.windowMs, { failClosed: policy.failClosed })
    ).toBe(true);
    expect(
      await limiter.checkRateLimit(firstKey, 2, policy.windowMs, { failClosed: policy.failClosed })
    ).toBe(true);
    expect(
      await limiter.checkRateLimit(firstKey, 2, policy.windowMs, { failClosed: policy.failClosed })
    ).toBe(false);

    // The same forward hop, a different visitor address: a fresh allowance.
    expect(
      await limiter.checkRateLimit(secondKey, 2, policy.windowMs, { failClosed: policy.failClosed })
    ).toBe(true);
  });
});
