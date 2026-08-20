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

function getCookieMock() {
  return (mockRequest.cookies as { getAll: ReturnType<typeof vi.fn> }).getAll;
}

function mockSessionCookie(names: string[] = ['sb-test-ref-auth-token']) {
  getCookieMock().mockReturnValue(names.map((name) => ({ name, value: 'session' })));
}

function mockChunkedSessionCookie() {
  mockSessionCookie(['sb-test-ref-auth-token.0', 'sb-test-ref-auth-token.1']);
}

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
  getCookieMock().mockReturnValue([]);
  mockExchangeCodeForSession.mockReset();
  mockGetSession.mockReset();
  mockGetUser.mockReset();
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'test-publishable-key';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
});

describe('middleware', () => {
  it('skips remote session calls for anonymous public page requests', async () => {
    const { middleware } = await import('@/middleware');
    await middleware(mockRequest as never);

    expect(mockGetSession).not.toHaveBeenCalled();
    expect(mockGetUser).not.toHaveBeenCalled();
  });

  it('calls getSession to refresh tokens when a session cookie is present', async () => {
    mockSessionCookie();
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } });
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });

    const { middleware } = await import('@/middleware');
    await middleware(mockRequest as never);

    expect(mockGetSession).toHaveBeenCalled();
  });

  it('calls getSession when the session cookie is chunked (auth-token.0, .1, ...)', async () => {
    mockChunkedSessionCookie();
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } });
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });

    const { middleware } = await import('@/middleware');
    await middleware(mockRequest as never);

    expect(mockGetSession).toHaveBeenCalled();
  });

  it('redirects logged-in users away from auth pages to root', async () => {
    mockSessionCookie();
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
    mockSessionCookie();
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
    mockSessionCookie();
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

  it('redirects unauthenticated users from a nested editor route with the full path', async () => {
    mockGetSession.mockResolvedValue({ data: { session: null } });
    mockGetUser.mockResolvedValue({ data: { user: null } });
    mockNextUrl.pathname = '/blogpress/editor/abc123';
    mockRequest.url = 'https://royaraqamia.com/blogpress/editor/abc123';

    const { middleware } = await import('@/middleware');
    const result = await middleware(mockRequest as never);
    expect(result.status).toBe(307);
    expect(result.url).toContain('/auth/login');
    expect(result.url).toContain('redirect=%2Fblogpress%2Feditor%2Fabc123');
  });

  it('redirects a logged-in user away from /auth/login to the requested safe redirect', async () => {
    mockSessionCookie();
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } });
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    mockNextUrl.pathname = '/auth/login';
    mockNextUrl.searchParams = new URLSearchParams('redirect=/spendtrack/app');
    mockRequest.url = 'https://royaraqamia.com/auth/login?redirect=%2Fspendtrack%2Fapp';

    const { middleware } = await import('@/middleware');
    const result = await middleware(mockRequest as never);
    expect(result.status).toBe(307);
    expect(result.url).toBe('https://royaraqamia.com/spendtrack/app');
  });

  it('ignores an unsafe redirect param when bouncing logged-in users off auth pages', async () => {
    mockSessionCookie();
    mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'u1' } } } });
    mockGetUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
    mockNextUrl.pathname = '/auth/login';
    mockNextUrl.searchParams = new URLSearchParams('redirect=//evil.com');
    mockRequest.url = 'https://royaraqamia.com/auth/login?redirect=%2F%2Fevil.com';

    const { middleware } = await import('@/middleware');
    const result = await middleware(mockRequest as never);
    expect(result.status).toBe(307);
    expect(result.url).toBe('https://royaraqamia.com/');
  });

  it('redirects auth signup page to root when user is logged in', async () => {
    mockSessionCookie();
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
