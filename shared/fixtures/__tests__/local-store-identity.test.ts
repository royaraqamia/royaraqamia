import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  identityFromUser,
  identityUserId,
  localStoreName,
  userIdentity,
  type LocalIdentity,
} from '@/frontend/shared/local-store/identity';

/**
 * The Local Store's partition, from the web side (#768).
 *
 * The same `identity.json` the app's suite reads (`IdentityFixtureTest.kt`) is
 * the source of the cases, so a device's rows are found under one name by both
 * clients or not at all — the rule `docs/mobile/two-clients.md` states for
 * contracts, applied to the thing a contract is stored in.
 */
const fixture = JSON.parse(
  readFileSync(join(process.cwd(), 'shared/fixtures/local-store/identity.json'), 'utf8')
) as {
  product: string;
  cases: Array<{ name: string; userId: string | null; identity: string; store: string }>;
};

describe('the Local Store partition', () => {
  it('names the partition the app names', () => {
    for (const testCase of fixture.cases) {
      const identity = identityFromUser({ id: testCase.userId });
      expect(identity, testCase.name).toBe(testCase.identity);
      expect(localStoreName(fixture.product, identity), testCase.name).toBe(testCase.store);
    }
  });

  it('answers the account id inside a partition, and null for a guest', () => {
    for (const testCase of fixture.cases) {
      const identity = testCase.identity as LocalIdentity;
      expect(identityUserId(identity), testCase.name).toBe(testCase.userId || null);
    }
  });

  it('round-trips an account id through its partition name', () => {
    for (const testCase of fixture.cases) {
      if (!testCase.userId) continue;
      expect(identityUserId(userIdentity(testCase.userId)), testCase.name).toBe(testCase.userId);
    }
  });
});
