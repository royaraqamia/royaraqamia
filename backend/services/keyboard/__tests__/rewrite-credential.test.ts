import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  KEYBOARD_CREDENTIAL_TTL_SECONDS,
  mintKeyboardCredential,
  verifyKeyboardCredential,
} from '@/backend/services/keyboard/rewrite-credential';
import { KEYBOARD_REWRITE_SCOPE } from '@/shared/contracts/keyboard-rewrite';

const USER = '11111111-2222-4333-8444-555555555555';

beforeEach(() => {
  vi.stubEnv('KEYBOARD_REWRITE_SECRET', 'test-keyboard-secret');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('the scoped keyboard credential', () => {
  it('round-trips a member with only the rewrite scope and a short TTL', () => {
    const minted = mintKeyboardCredential(USER, () => 1000)!;
    expect(minted.expiresAt - 1000).toBe(KEYBOARD_CREDENTIAL_TTL_SECONDS);

    const verified = verifyKeyboardCredential(`Bearer ${minted.token}`, () => 1001);
    expect(verified?.userId).toBe(USER);
    const payload = JSON.parse(
      Buffer.from(minted.token.split('.')[0] as string, 'base64url').toString('utf8')
    );
    expect(payload).toEqual({
      v: 1,
      sub: USER,
      scope: KEYBOARD_REWRITE_SCOPE,
      iat: 1000,
      exp: 1000 + KEYBOARD_CREDENTIAL_TTL_SECONDS,
    });
  });

  it('refuses an expired token and one minted a second too far in the future', () => {
    const minted = mintKeyboardCredential(USER, () => 1000)!;
    expect(
      verifyKeyboardCredential(
        `Bearer ${minted.token}`,
        () => 1000 + KEYBOARD_CREDENTIAL_TTL_SECONDS
      )
    ).toBeNull();
    expect(verifyKeyboardCredential(`Bearer ${minted.token}`, () => 999)).not.toBeNull();
  });

  it('refuses a tampered or differently scoped token', () => {
    const minted = mintKeyboardCredential(USER, () => 1000)!;
    const [payload, signature] = minted.token.split('.') as [string, string];
    const changed = Buffer.from(
      JSON.stringify({ v: 1, sub: USER, scope: 'site.session', iat: 1000, exp: 2000 })
    ).toString('base64url');

    expect(verifyKeyboardCredential(`Bearer ${changed}.${signature}`, () => 1001)).toBeNull();
    expect(verifyKeyboardCredential(`Bearer ${payload}.${signature}x`, () => 1001)).toBeNull();
  });

  it('never accepts a cookie, a bare credential or another surface bearer token', () => {
    const minted = mintKeyboardCredential(USER, () => 1000)!;
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.signature';

    expect(verifyKeyboardCredential('sb-access-token=secret', () => 1001)).toBeNull();
    expect(verifyKeyboardCredential(minted.token, () => 1001)).toBeNull();
    expect(verifyKeyboardCredential(`Bearer ${jwt}`, () => 1001)).toBeNull();
    expect(verifyKeyboardCredential(null, () => 1001)).toBeNull();
  });

  it('refuses to mint or verify with no server secret at all', () => {
    vi.stubEnv('KEYBOARD_REWRITE_SECRET', '');
    vi.stubEnv('MCP_TOKEN_ENCRYPTION_KEY', '');

    expect(mintKeyboardCredential(USER, () => 1000)).toBeNull();
    const mintedElsewhere = mintKeyboardCredential(USER, () => 1000);
    vi.stubEnv('KEYBOARD_REWRITE_SECRET', 'another-secret');
    expect(
      verifyKeyboardCredential(`Bearer ${mintedElsewhere?.token ?? ''}`, () => 1001)
    ).toBeNull();
  });
});
