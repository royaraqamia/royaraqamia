import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockSync = vi.fn();

vi.mock('@/backend/config/admin-allowlist', () => ({
  createAdminAllowlistService: () => ({ sync: mockSync }),
}));

import { syncAdminAllowlist } from '@/backend/controllers/admin-allowlist';

const ENV_KEYS = ['ADMIN_SYNC_SECRET', 'SUPABASE_SERVICE_ROLE_KEY', 'ADMIN_EMAILS'];
const originalEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

beforeEach(() => {
  vi.clearAllMocks();
  process.env.ADMIN_SYNC_SECRET = 'sync-secret';
  // The controller must never accept this one any more.
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'sb_secret_database_key';
  process.env.ADMIN_EMAILS = 'admin@example.com';
  mockSync.mockResolvedValue({ added: [], removed: [] });
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    const value = originalEnv[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe('syncAdminAllowlist', () => {
  it('refuses a request with no bearer token', async () => {
    const result = await syncAdminAllowlist({ authorization: null, dryRun: false });

    expect(result.status).toBe(401);
    expect(mockSync).not.toHaveBeenCalled();
  });

  it('refuses the Supabase service-role key, even though it is a valid secret', async () => {
    const result = await syncAdminAllowlist({
      authorization: 'Bearer sb_secret_database_key',
      dryRun: false,
    });

    expect(result.status).toBe(401);
    expect(mockSync).not.toHaveBeenCalled();
  });

  it('refuses a wrong token of the same length', async () => {
    const result = await syncAdminAllowlist({
      authorization: 'Bearer nope-secret',
      dryRun: false,
    });

    expect(result.status).toBe(401);
    expect(mockSync).not.toHaveBeenCalled();
  });

  it('runs the sync for its own secret', async () => {
    const result = await syncAdminAllowlist({
      authorization: 'Bearer sync-secret',
      dryRun: true,
    });

    expect(result.status).toBe(200);
    expect(mockSync).toHaveBeenCalledWith(['admin@example.com'], { dryRun: true });
  });

  it('refuses every request when the secret is not configured', async () => {
    delete process.env.ADMIN_SYNC_SECRET;

    const result = await syncAdminAllowlist({
      authorization: 'Bearer sync-secret',
      dryRun: false,
    });

    expect(result.status).toBe(401);
    expect(mockSync).not.toHaveBeenCalled();
  });
});
