import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/backend/models/database.types';
import { createSupabaseAuthGateway } from '@/backend/clients/supabase-auth-gateway';

function makeClients() {
  const admin = {
    auth: {
      admin: {
        updateUserById: vi.fn().mockResolvedValue({ error: null }),
      },
    },
    from: vi.fn(),
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  };

  const supabase = {
    auth: {
      signUp: vi.fn(),
      signInWithPassword: vi.fn(),
      getUser: vi.fn(),
      signOut: vi.fn(),
      signInWithOAuth: vi.fn(),
      resetPasswordForEmail: vi.fn(),
    },
    from: vi.fn(),
  };

  return { supabase, admin };
}

function makeUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 'u-1',
    email: 'user@example.com',
    user_metadata: { name: 'مستخدم' },
    email_confirmed_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('createSupabaseAuthGateway', () => {
  let supabase: ReturnType<typeof makeClients>['supabase'];
  let admin: ReturnType<typeof makeClients>['admin'];

  beforeEach(() => {
    vi.clearAllMocks();
    const clients = makeClients();
    supabase = clients.supabase;
    admin = clients.admin;
  });

  it('signUp passes name into user_metadata and returns user/error', async () => {
    (supabase.auth.signUp as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { user: makeUser(), session: null },
      error: null,
    });
    const gateway = createSupabaseAuthGateway(
      supabase as unknown as SupabaseClient<Database>,
      admin as unknown as SupabaseClient<Database>
    );

    const result = await gateway.signUp({
      email: 'user@example.com',
      password: 'StrongP@ss1',
      name: 'مستخدم',
    });

    expect(supabase.auth.signUp).toHaveBeenCalledWith({
      email: 'user@example.com',
      password: 'StrongP@ss1',
      options: { data: { name: 'مستخدم' } },
    });
    expect(result).toEqual({
      user: { id: 'u-1' },
      error: null,
      hasSession: false,
      existing: false,
    });
  });

  it('signUp flags an existing email returned as a decoy user with no identities', async () => {
    (supabase.auth.signUp as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { user: makeUser({ identities: [] }), session: null },
      error: null,
    });
    const gateway = createSupabaseAuthGateway(
      supabase as unknown as SupabaseClient<Database>,
      admin as unknown as SupabaseClient<Database>
    );

    const result = await gateway.signUp({
      email: 'user@example.com',
      password: 'StrongP@ss1',
      name: 'مستخدم',
    });

    expect(result.existing).toBe(true);
  });

  it('signUp reports hasSession true when Supabase returns a session', async () => {
    (supabase.auth.signUp as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: {
        user: makeUser({ identities: [{ id: 'i-1' }] }),
        session: { access_token: 'token' },
      },
      error: null,
    });
    const gateway = createSupabaseAuthGateway(
      supabase as unknown as SupabaseClient<Database>,
      admin as unknown as SupabaseClient<Database>
    );

    const result = await gateway.signUp({
      email: 'user@example.com',
      password: 'StrongP@ss1',
      name: 'مستخدم',
    });

    expect(result.hasSession).toBe(true);
    expect(result.existing).toBe(false);
  });

  it('signUp returns the error when sign-up fails', async () => {
    (supabase.auth.signUp as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { user: null, session: null },
      error: { message: 'User already registered' },
    });
    const gateway = createSupabaseAuthGateway(
      supabase as unknown as SupabaseClient<Database>,
      admin as unknown as SupabaseClient<Database>
    );

    await expect(
      gateway.signUp({ email: 'a@b.com', password: 'StrongP@ss1', name: 'مستخدم' })
    ).resolves.toEqual({
      user: null,
      error: { message: 'User already registered' },
      hasSession: false,
      existing: false,
    });
  });

  it('signInWithPassword maps the user through toAuthUser', async () => {
    (supabase.auth.signInWithPassword as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { user: makeUser() },
      error: null,
    });
    const gateway = createSupabaseAuthGateway(
      supabase as unknown as SupabaseClient<Database>,
      admin as unknown as SupabaseClient<Database>
    );

    const result = await gateway.signInWithPassword({
      email: 'user@example.com',
      password: 'StrongP@ss1',
    });

    expect(result).toEqual({
      user: {
        id: 'u-1',
        email: 'user@example.com',
        name: 'مستخدم',
        email_confirmed_at: '2026-01-01T00:00:00.000Z',
      },
      error: null,
    });
  });

  it('signInWithPassword returns null user with empty email when missing', async () => {
    (supabase.auth.signInWithPassword as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { user: { id: 'u-1' } },
      error: null,
    });
    const gateway = createSupabaseAuthGateway(
      supabase as unknown as SupabaseClient<Database>,
      admin as unknown as SupabaseClient<Database>
    );

    const result = await gateway.signInWithPassword({ email: 'a@b.com', password: 'StrongP@ss1' });
    expect(result.user).toEqual({ id: 'u-1', email: '', email_confirmed_at: null });
  });

  it('getUser returns the current session user or null', async () => {
    (supabase.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { user: makeUser() },
    });
    const gateway = createSupabaseAuthGateway(
      supabase as unknown as SupabaseClient<Database>,
      admin as unknown as SupabaseClient<Database>
    );
    await expect(gateway.getUser()).resolves.toEqual({
      user: {
        id: 'u-1',
        email: 'user@example.com',
        name: 'مستخدم',
        email_confirmed_at: '2026-01-01T00:00:00.000Z',
      },
    });

    (supabase.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({ data: { user: null } });
    await expect(gateway.getUser()).resolves.toEqual({ user: null });
  });

  it('updateUserPassword uses the admin client to set a specific user password', async () => {
    (admin.auth.admin.updateUserById as ReturnType<typeof vi.fn>).mockResolvedValue({
      error: null,
    });
    const gateway = createSupabaseAuthGateway(
      supabase as unknown as SupabaseClient<Database>,
      admin as unknown as SupabaseClient<Database>
    );
    await expect(gateway.updateUserPassword('user-1', 'NewStrongP@ss1')).resolves.toEqual({
      error: null,
    });
    expect(admin.auth.admin.updateUserById).toHaveBeenCalledWith('user-1', {
      password: 'NewStrongP@ss1',
    });
  });

  it('signOut calls auth.signOut', async () => {
    (supabase.auth.signOut as ReturnType<typeof vi.fn>).mockResolvedValue({ error: null });
    const gateway = createSupabaseAuthGateway(
      supabase as unknown as SupabaseClient<Database>,
      admin as unknown as SupabaseClient<Database>
    );
    await gateway.signOut();
    expect(supabase.auth.signOut).toHaveBeenCalled();
  });

  it('signInWithOAuth passes provider and redirectTo', async () => {
    (supabase.auth.signInWithOAuth as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { url: 'https://accounts.google.com/...' },
      error: null,
    });
    const gateway = createSupabaseAuthGateway(
      supabase as unknown as SupabaseClient<Database>,
      admin as unknown as SupabaseClient<Database>
    );
    await expect(
      gateway.signInWithOAuth('google', 'https://royaraqamia.com/auth/callback')
    ).resolves.toEqual({
      url: 'https://accounts.google.com/...',
      error: null,
    });
    expect(supabase.auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'google',
      options: { redirectTo: 'https://royaraqamia.com/auth/callback' },
    });
  });

  it('resetPasswordForEmail passes the redirectTo option', async () => {
    (supabase.auth.resetPasswordForEmail as ReturnType<typeof vi.fn>).mockResolvedValue({
      error: null,
    });
    const gateway = createSupabaseAuthGateway(
      supabase as unknown as SupabaseClient<Database>,
      admin as unknown as SupabaseClient<Database>
    );
    await gateway.resetPasswordForEmail(
      'user@example.com',
      'https://royaraqamia.com/auth/update-password'
    );
    expect(supabase.auth.resetPasswordForEmail).toHaveBeenCalledWith('user@example.com', {
      redirectTo: 'https://royaraqamia.com/auth/update-password',
    });
  });

  it('confirmUserEmail uses the admin client', async () => {
    const gateway = createSupabaseAuthGateway(
      supabase as unknown as SupabaseClient<Database>,
      admin as unknown as SupabaseClient<Database>
    );
    await gateway.confirmUserEmail('u-1');
    expect(admin.auth.admin.updateUserById).toHaveBeenCalledWith('u-1', { email_confirm: true });
  });

  it('getUserByEmail resolves the user via the service-role RPC', async () => {
    (admin.rpc as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: [
        { id: 'u-1', email: 'user@example.com', email_confirmed_at: '2026-01-01T00:00:00.000Z' },
      ],
      error: null,
    });
    const gateway = createSupabaseAuthGateway(
      supabase as unknown as SupabaseClient<Database>,
      admin as unknown as SupabaseClient<Database>
    );

    const result = await gateway.getUserByEmail('  User@Example.COM ');

    expect(admin.rpc).toHaveBeenCalledWith('get_auth_user_by_email', {
      p_email: 'user@example.com',
    });
    expect(result.user).toEqual({
      id: 'u-1',
      email: 'user@example.com',
      email_confirmed_at: '2026-01-01T00:00:00.000Z',
    });
  });

  it('getUserByEmail returns null when the RPC returns no row', async () => {
    (admin.rpc as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [], error: null });
    const gateway = createSupabaseAuthGateway(
      supabase as unknown as SupabaseClient<Database>,
      admin as unknown as SupabaseClient<Database>
    );
    const result = await gateway.getUserByEmail('nobody@example.com');
    expect(result.user).toBeNull();
  });

  it('getUserByEmail returns null when the RPC errors', async () => {
    (admin.rpc as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: null,
      error: { message: 'permission denied' },
    });
    const gateway = createSupabaseAuthGateway(
      supabase as unknown as SupabaseClient<Database>,
      admin as unknown as SupabaseClient<Database>
    );
    const result = await gateway.getUserByEmail('user@example.com');
    expect(result.user).toBeNull();
  });
});
