import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockNextUrl: {
  searchParams: URLSearchParams;
  pathname: string;
  clone: ReturnType<typeof vi.fn>;
} = {
  searchParams: new URLSearchParams(),
  pathname: '/',
  clone: vi.fn(),
};

const mockRequest: Record<string, unknown> = {
  url: 'https://royaraqamia.com/',
  cookies: {
    getAll: vi.fn().mockReturnValue([]),
    set: vi.fn(),
  },
  nextUrl: mockNextUrl,
};

function convertRedirectUrl(
  url:
    | string
    | URL
    | { pathname: string; searchParams: URLSearchParams; toString?: () => string; href?: string }
): string {
  if (typeof url === 'string') return url;
  if (url instanceof URL) return url.href;
  if (typeof url.toString === 'function' && url.toString !== Object.prototype.toString) {
    return url.toString();
  }
  let href = 'https://royaraqamia.com';
  if (url.pathname) href += url.pathname;
  const qs = url.searchParams?.toString();
  if (qs) href += '?' + qs;
  return href;
}

vi.mock('next/server', () => ({
  NextResponse: {
    next: vi.fn(() => ({
      cookies: { set: vi.fn() },
    })),
    redirect: vi.fn((url: string | URL | { pathname: string; searchParams: URLSearchParams }) => {
      const href = convertRedirectUrl(url);
      return {
        headers: new Headers({ location: href }),
        status: 307,
        url: href,
      };
    }),
  },
  NextRequest: vi.fn(),
}));

const mockExchangeCodeForSession = vi.fn();
const mockGetSession = vi.fn();
const mockGetUser = vi.fn();

vi.mock('@supabase/ssr', () => ({
  createServerClient: vi.fn(() => ({
    auth: {
      exchangeCodeForSession: mockExchangeCodeForSession,
      getSession: mockGetSession,
      getUser: mockGetUser,
    },
  })),
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: vi.fn(() => ({
      upsert: vi.fn(() => ({ maybeSingle: vi.fn() })),
    })),
  })),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockNextUrl.pathname = '/';
  mockNextUrl.searchParams = new URLSearchParams();
  mockNextUrl.clone.mockReturnValue({
    pathname: '/',
    searchParams: new URLSearchParams(),
  });
  mockRequest.url = 'https://royaraqamia.com/';
  mockExchangeCodeForSession.mockReset();
  mockGetSession.mockReset();
  mockGetUser.mockReset();
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'test-publishable-key';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
});

describe('middleware', () => {
  it('calls getSession to refresh tokens on every request', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const { middleware } = await import('@/middleware');
    await middleware(mockRequest as never);

    expect(mockGetSession).toHaveBeenCalled();
  });

  it('redirects logged-in users away from auth pages to root', async () => {
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } });
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    mockNextUrl.pathname = '/auth/login';
    mockRequest.url = 'https://royaraqamia.com/auth/login';

    const { middleware } = await import('@/middleware');
    const result = await middleware(mockRequest as never);
    expect(result.status).toBe(307);
    expect(result.url).toBe('https://royaraqamia.com/');
  });

  it('redirects unauthenticated users from protected routes to login', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    mockGetUser.mockResolvedValue({ data: { user: null } });
    mockNextUrl.pathname = '/linksnap/app';
    mockRequest.url = 'https://royaraqamia.com/linksnap/app';

    const { middleware } = await import('@/middleware');
    const result = await middleware(mockRequest as never);
    expect(result.status).toBe(307);
    expect(result.url).toContain('/auth/login');
  });

  it('allows authenticated users through to protected routes', async () => {
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } });
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    mockNextUrl.pathname = '/habitflow';

    const { middleware } = await import('@/middleware');
    const result = await middleware(mockRequest as never);
    expect(result.status).toBeUndefined();
  });

  it('allows unauthenticated users to access public routes', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    mockGetUser.mockResolvedValue({ data: { user: null } });
    mockNextUrl.pathname = '/';

    const { middleware } = await import('@/middleware');
    const result = await middleware(mockRequest as never);
    expect(result.status).toBeUndefined();
  });

  it('exchanges auth code for session when code param is present', async () => {
    mockExchangeCodeForSession.mockResolvedValue({ data: {}, error: null });
    mockGetSession.mockResolvedValue({ data: { session: null } });
    mockGetUser.mockResolvedValue({
      data: {
        user: {
          id: 'u-oauth',
          email: 'oauth@test.com',
          app_metadata: { provider: 'google' },
          user_metadata: { full_name: 'Test User', avatar_url: 'https://avatar.com/1' },
        },
      },
      error: null,
    });
    mockNextUrl.pathname = '/auth/callback';
    mockNextUrl.searchParams = new URLSearchParams('code=auth-code&next=/spendtrack');
    mockRequest.url = 'https://royaraqamia.com/auth/callback?code=auth-code&next=/spendtrack';

    const { middleware } = await import('@/middleware');
    const result = await middleware(mockRequest as never);
    expect(mockExchangeCodeForSession).toHaveBeenCalled();
    expect(result.status).toBe(307);
    expect(result.url).toBe('https://royaraqamia.com/spendtrack');
  });

  it('keeps users on the update-password page after exchanging a recovery code', async () => {
    mockExchangeCodeForSession.mockResolvedValue({ data: {}, error: null });
    mockGetSession.mockResolvedValue({ data: { session: null } });
    mockGetUser.mockResolvedValue({
      data: {
        user: {
          id: 'u-recovery',
          email: 'user@example.com',
          app_metadata: { provider: 'email' },
        },
      },
      error: null,
    });
    mockNextUrl.pathname = '/auth/update-password';
    mockNextUrl.searchParams = new URLSearchParams('code=recovery-code');
    mockRequest.url = 'https://royaraqamia.com/auth/update-password?code=recovery-code';

    const { middleware } = await import('@/middleware');
    const result = await middleware(mockRequest as never);
    expect(mockExchangeCodeForSession).toHaveBeenCalled();
    expect(result.status).toBe(307);
    expect(result.url).toBe('https://royaraqamia.com/auth/update-password');
  });

  it('does not bounce authenticated users away from the update-password page', async () => {
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } });
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    mockNextUrl.pathname = '/auth/update-password';
    mockRequest.url = 'https://royaraqamia.com/auth/update-password';

    const { middleware } = await import('@/middleware');
    const result = await middleware(mockRequest as never);
    expect(result.status).toBeUndefined();
  });

  it('redirects unauthenticated users from /admin to login', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    mockGetUser.mockResolvedValue({ data: { user: null } });
    mockNextUrl.pathname = '/admin';
    mockRequest.url = 'https://royaraqamia.com/admin';

    const { middleware } = await import('@/middleware');
    const result = await middleware(mockRequest as never);
    expect(result.status).toBe(307);
    expect(result.url).toContain('/auth/login');
  });

  it('redirects auth signup page to root when user is logged in', async () => {
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } });
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    mockNextUrl.pathname = '/auth/signup';
    mockRequest.url = 'https://royaraqamia.com/auth/signup';

    const { middleware } = await import('@/middleware');
    const result = await middleware(mockRequest as never);
    expect(result.status).toBe(307);
    expect(result.url).toBe('https://royaraqamia.com/');
  });

  it('does not redirect unauthenticated users on auth pages', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    mockGetUser.mockResolvedValue({ data: { user: null } });
    mockNextUrl.pathname = '/auth/signup';

    const { middleware } = await import('@/middleware');
    const result = await middleware(mockRequest as never);
    expect(result.status).toBeUndefined();
  });
});
