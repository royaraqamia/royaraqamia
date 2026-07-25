import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockExchangeCodeForSession = vi.fn();
const mockGetUser = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue({
    auth: {
      exchangeCodeForSession: mockExchangeCodeForSession,
      getUser: mockGetUser,
    },
  }),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: vi.fn(() => ({
      upsert: vi.fn(() => ({ maybeSingle: vi.fn() })),
    })),
  })),
}));

vi.mock('@sentry/nextjs', () => ({
  captureMessage: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockExchangeCodeForSession.mockReset();
  mockGetUser.mockReset();
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
});

function mockRequest(url: string) {
  return new Request(url);
}

describe('GET /auth/callback', () => {
  it('redirects to error page when error param is present', async () => {
    const { GET } = await import('@/app/auth/callback/route');
    const response = await GET(
      mockRequest('https://royaraqamia.com/auth/callback?error=access_denied')
    );
    expect(response.status).toBe(307);
    const location = response.headers.get('Location') ?? '';
    expect(location).toContain('/auth/error');
    expect(location).toContain('access_denied');
  });

  it('exchanges code for session when code param is present', async () => {
    mockExchangeCodeForSession.mockResolvedValue({ error: null });
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });

    const { GET } = await import('@/app/auth/callback/route');
    const response = await GET(
      mockRequest('https://royaraqamia.com/auth/callback?code=valid-code')
    );
    expect(mockExchangeCodeForSession).toHaveBeenCalledWith('valid-code');
    expect(response.status).toBe(307);
  });

  it('creates public.users record for Google OAuth user', async () => {
    mockExchangeCodeForSession.mockResolvedValue({ error: null });
    mockGetUser.mockResolvedValue({
      data: {
        user: {
          id: 'google-user-id',
          email: 'google@test.com',
          app_metadata: { provider: 'google' },
          user_metadata: { full_name: 'Google User', avatar_url: 'https://avatar.com/1' },
        },
      },
      error: null,
    });

    const { createClient } = await import('@supabase/supabase-js');
    const mockAdminFrom = vi.fn();
    const mockUpsert = vi.fn(() => ({ maybeSingle: vi.fn() }));
    mockAdminFrom.mockReturnValue({ upsert: mockUpsert });
    vi.mocked(createClient).mockReturnValue({ from: mockAdminFrom } as never);

    const { GET } = await import('@/app/auth/callback/route');
    const response = await GET(
      mockRequest('https://royaraqamia.com/auth/callback?code=google-code')
    );

    expect(mockAdminFrom).toHaveBeenCalled();
    expect(response.status).toBe(307);
  });

  it('redirects to next param after successful code exchange', async () => {
    mockExchangeCodeForSession.mockResolvedValue({ error: null });
    mockGetUser.mockResolvedValue({ data: { user: null }, error: null });

    const { GET } = await import('@/app/auth/callback/route');
    const response = await GET(
      mockRequest('https://royaraqamia.com/auth/callback?code=valid&next=/spendtrack')
    );
    const location = response.headers.get('Location') ?? '';
    expect(location).toContain('/spendtrack');
  });

  it('redirects to home when no code and no error', async () => {
    const { GET } = await import('@/app/auth/callback/route');
    const response = await GET(mockRequest('https://royaraqamia.com/auth/callback'));
    expect(response.status).toBe(307);
    const location = response.headers.get('Location') ?? '';
    expect(location).toBe('https://royaraqamia.com/');
  });

  it('redirects to error page when code exchange fails', async () => {
    mockExchangeCodeForSession.mockResolvedValue({ error: { message: 'Invalid code' } });

    const { GET } = await import('@/app/auth/callback/route');
    const response = await GET(mockRequest('https://royaraqamia.com/auth/callback?code=bad-code'));
    const location = response.headers.get('Location') ?? '';
    expect(location).toContain('/auth/error');
  });
});
