import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createGitHubAppClient } from '@/backend/clients/github-app';

describe('GitHub App user authorization', () => {
  beforeEach(() => {
    process.env.GITHUB_APP_ID = '123456';
    process.env.GITHUB_APP_CLIENT_ID = 'Iv23liUpAYX7LJB35MnF';
    process.env.GITHUB_APP_CLIENT_SECRET = 'secret';
    process.env.GITHUB_APP_PRIVATE_KEY = 'not-used-in-these-tests';
    process.env.PUBLIC_ORIGIN = 'https://royaraqamia.com';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses the registered callback and no OAuth scope', () => {
    const url = new URL(createGitHubAppClient().authorizeUrl('state-123'));
    expect(url.searchParams.get('client_id')).toBe('Iv23liUpAYX7LJB35MnF');
    expect(url.searchParams.get('state')).toBe('state-123');
    expect(url.searchParams.get('redirect_uri')).toBe(
      'https://royaraqamia.com/api/coding/connect/callback'
    );
    // GitHub Apps do not accept OAuth scopes; only offline_access is supported.
    expect(url.searchParams.has('scope')).toBe(false);
  });

  it('reads a form-encoded token response and reports its error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('error=bad_verification_code&error_description=Code+expired', {
          status: 200,
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
        })
      )
    );
    await expect(createGitHubAppClient().exchangeUserCode('code')).rejects.toThrow('Code expired');
  });
});
