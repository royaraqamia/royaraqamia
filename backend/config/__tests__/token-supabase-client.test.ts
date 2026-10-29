import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const createClient = vi.fn();

vi.mock('@supabase/supabase-js', () => ({
  createClient: (...args: unknown[]) => createClient(...args),
}));
vi.mock('@supabase/ssr', () => ({ createServerClient: vi.fn() }));

import { createTokenSupabaseClient } from '@/backend/config/supabase';

const ENV_KEYS = ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'];
const originalEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));

beforeEach(() => {
  createClient.mockReset().mockReturnValue({ from: vi.fn() });
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://supabase.test';
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'publishable-key';
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    const value = originalEnv[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe('createTokenSupabaseClient', () => {
  it('sends the caller token and the publishable key, never the service role', () => {
    createTokenSupabaseClient('token-1');

    expect(createClient).toHaveBeenCalledWith(
      'https://supabase.test',
      'publishable-key',
      expect.objectContaining({
        global: { headers: { Authorization: 'Bearer token-1' } },
        auth: expect.objectContaining({ persistSession: false, autoRefreshToken: false }),
      })
    );
  });

  it('refuses to build a client without the deployment configuration', () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;

    expect(() => createTokenSupabaseClient('token-1')).toThrow('NEXT_PUBLIC_SUPABASE_URL');
    expect(createClient).not.toHaveBeenCalled();
  });
});
