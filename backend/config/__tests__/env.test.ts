import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { env } from '@/backend/config/env';

const KEY = 'PUSH_ENDPOINT_ALLOWLIST';

const DEFAULT_ALLOWLIST = [
  'fcm.googleapis.com',
  'updates.push.services.mozilla.com',
  '.notify.windows.com',
  'web.push.apple.com',
];

describe('env.pushEndpointAllowlist', () => {
  beforeEach(() => {
    delete process.env[KEY];
  });
  afterEach(() => {
    delete process.env[KEY];
  });

  it('falls back to the default allowlist when unset', () => {
    expect(env.pushEndpointAllowlist).toEqual(DEFAULT_ALLOWLIST);
  });

  it('treats a blank value as unset (does not disable push silently)', () => {
    process.env[KEY] = '';
    expect(env.pushEndpointAllowlist).toEqual(DEFAULT_ALLOWLIST);
  });

  it('parses and trims a custom comma-separated list', () => {
    process.env[KEY] = ' fcm.googleapis.com , example.com ';
    expect(env.pushEndpointAllowlist).toEqual(['fcm.googleapis.com', 'example.com']);
  });
});
