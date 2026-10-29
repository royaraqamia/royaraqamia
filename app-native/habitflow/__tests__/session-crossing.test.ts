import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The two halves of the credential/origin question (issue #500): what counts as
 * a remote surface, which transport a crossing uses, and what the Bearer session
 * keeps where.
 *
 * `Preferences` is the durable half of the session (the refresh token) and
 * native HTTP is the transport the spike probes with — both are mocked here, so
 * the assertions are about what this code asks them to do.
 */

const preferences = {
  get: vi.fn(async (_options: { key: string }) => ({ value: null as string | null })),
  set: vi.fn(async (_options: { key: string; value: string }) => {}),
  remove: vi.fn(async (_options: { key: string }) => {}),
};

const httpPost = vi.fn();
const httpGet = vi.fn();
const httpRequest = vi.fn();
const browserOpen = vi.fn(async (_options: { url: string }) => {});

vi.mock('@capacitor/preferences', () => ({ Preferences: preferences }));
vi.mock('@capacitor/core', () => ({
  CapacitorHttp: { post: httpPost, get: httpGet, request: httpRequest },
  Capacitor: { isNativePlatform: () => true },
}));
vi.mock('@capacitor/browser', () => ({ Browser: { open: browserOpen } }));

type SessionModule = typeof import('../session');
type CrossingModule = typeof import('../crossing');

async function sessionModule(): Promise<SessionModule> {
  vi.resetModules();
  return import('../session');
}

async function crossingModule(): Promise<CrossingModule> {
  vi.resetModules();
  return import('../crossing');
}

function tokenResponse(email = 'a@b.c') {
  return {
    status: 200,
    data: {
      access_token: 'access-1',
      refresh_token: 'refresh-1',
      expires_in: 3600,
      user: { id: 'user-1', email },
    },
  };
}

beforeEach(() => {
  preferences.get.mockResolvedValue({ value: null });
  preferences.set.mockClear();
  preferences.remove.mockClear();
  httpPost.mockReset();
  httpGet.mockReset();
  httpRequest.mockReset();
  browserOpen.mockClear();
});

describe('remote surfaces', () => {
  it('owns the bundled route and nothing else it lists as remote', async () => {
    const { isRemoteSurface } = await crossingModule();

    expect(isRemoteSurface('/habitflow', '/habitflow')).toBe(false);
    expect(isRemoteSurface('/community', '/community')).toBe(true);
    expect(isRemoteSurface('/community/threads', '/community/threads')).toBe(true);
    expect(isRemoteSurface('/habitflow', '/habitflow/')).toBe(false);
  });

  it('parses the href instead of trusting a prefix of it', async () => {
    const { isRemoteSurface } = await crossingModule();

    expect(isRemoteSurface('https://royaraqamia.com/reading', '/reading')).toBe(true);
    expect(isRemoteSurface('https://royaraqamia.com', '/')).toBe(true);

    // The shapes a `startsWith(REMOTE_ORIGIN)` test used to accept.
    expect(isRemoteSurface('https://royaraqamia.com.evil.example/reading', '/reading')).toBe(false);
    expect(isRemoteSurface('https://evil.example/?next=https://royaraqamia.com', '/')).toBe(false);
    expect(
      isRemoteSurface('https://evil.example/https://royaraqamia.com', '/https://royaraqamia.com')
    ).toBe(false);
    expect(isRemoteSurface('not a url', '/not a url')).toBe(false);
  });

  it('crosses through the chosen mechanism', async () => {
    const { openRemote, setRemoteMechanism, remoteMechanism } = await crossingModule();

    await openRemote('/community', '', 'custom-tab');
    expect(browserOpen).toHaveBeenCalledWith({ url: 'https://royaraqamia.com/community' });

    const assign = vi.fn();
    vi.stubGlobal('location', { ...window.location, assign });
    await openRemote('/community', '?page=2', 'webview');
    expect(assign).toHaveBeenCalledWith('https://royaraqamia.com/community?page=2');
    vi.unstubAllGlobals();

    await setRemoteMechanism('custom-tab');
    expect(remoteMechanism()).toBe('custom-tab');
    expect(preferences.set).toHaveBeenCalledWith({
      key: 'spike.remote-mechanism',
      value: 'custom-tab',
    });
  });
});

describe('Bearer session', () => {
  it('keeps the refresh token in Preferences and mints on restore', async () => {
    preferences.get.mockResolvedValue({ value: 'refresh-1' });
    httpPost.mockResolvedValue(tokenResponse());

    const { restoreSession, spikeSession, accessToken } = await sessionModule();
    const restored = await restoreSession();

    expect(restored?.email).toBe('a@b.c');
    expect(spikeSession()?.userId).toBe('user-1');
    // Rotated refresh token is written back, access token never is.
    expect(preferences.set).toHaveBeenCalledWith({
      key: 'royaraqamia.session.refresh-token',
      value: 'refresh-1',
    });
    expect(preferences.set).not.toHaveBeenCalledWith(
      expect.objectContaining({ value: 'access-1' })
    );
    expect(await accessToken()).toBe('access-1');
  });

  it('drops a refresh token the server refuses', async () => {
    preferences.get.mockResolvedValue({ value: 'stale' });
    httpPost.mockResolvedValue({ status: 400, data: { error_description: 'invalid_grant' } });

    const { restoreSession, spikeSession } = await sessionModule();

    expect(await restoreSession()).toBeNull();
    expect(spikeSession()).toBeNull();
    expect(preferences.remove).toHaveBeenCalledWith({ key: 'royaraqamia.session.refresh-token' });
  });

  it('refreshes before answering with an almost-expired token', async () => {
    httpPost.mockResolvedValueOnce({
      status: 200,
      data: {
        access_token: 'access-old',
        refresh_token: 'refresh-old',
        expires_in: 30,
        user: { id: 'user-1', email: 'a@b.c' },
      },
    });
    preferences.get.mockResolvedValue({ value: 'refresh-old' });

    const { signIn, accessToken } = await sessionModule();
    await signIn('a@b.c', 'secret');

    httpPost.mockResolvedValueOnce(tokenResponse());
    // 30s of life is under the one-minute margin, so the next read re-mints.
    expect(await accessToken()).toBe('access-1');
    expect(httpPost).toHaveBeenCalledTimes(2);
  });
});

describe('session refresh and provider sign-in', () => {
  function expiredResponse(id: string) {
    return {
      status: 200,
      data: {
        access_token: `access-${id}`,
        refresh_token: `refresh-${id}`,
        expires_in: 3600,
        user: { id: 'user-1', email: 'a@b.c' },
      },
    };
  }

  it('single-flights concurrent refreshes into one grant', async () => {
    preferences.get.mockResolvedValue({ value: 'refresh-stored' });
    let release: (value: unknown) => void = () => undefined;
    httpPost.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve;
        })
    );

    const { restoreSession } = await sessionModule();
    const first = restoreSession();
    const second = restoreSession();

    // Both callers are waiting on the same grant; no second POST has happened.
    await vi.waitFor(() => expect(httpPost).toHaveBeenCalledTimes(1));

    release(expiredResponse('1'));
    const [a, b] = await Promise.all([first, second]);
    expect(a?.accessToken).toBe('access-1');
    expect(b?.accessToken).toBe('access-1');
    expect(httpPost).toHaveBeenCalledTimes(1);
  });

  it('re-authenticates once when concurrent requests are rejected', async () => {
    preferences.get.mockResolvedValue({ value: 'refresh-stored' });
    httpPost.mockResolvedValueOnce(expiredResponse('1'));

    const { restoreSession, authorizedRequest } = await sessionModule();
    await restoreSession();

    // The old token is rejected by both calls; the refresh is shared.
    httpRequest
      .mockResolvedValueOnce({ status: 401, data: { error: 'expired' } })
      .mockResolvedValueOnce({ status: 401, data: { error: 'expired' } })
      .mockResolvedValueOnce({ status: 200, data: { ok: 'first' } })
      .mockResolvedValueOnce({ status: 200, data: { ok: 'second' } });

    let release: (value: unknown) => void = () => undefined;
    httpPost.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve;
        })
    );

    const pending = Promise.all([
      authorizedRequest('/habitflow/api/habits'),
      authorizedRequest('/habitflow/api/habits'),
    ]);
    await vi.waitFor(() => expect(httpPost).toHaveBeenCalledTimes(2));
    release(expiredResponse('2'));
    const [first, second] = await pending;

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(httpPost).toHaveBeenCalledTimes(2);
    const retries = httpRequest.mock.calls.filter(
      (call) =>
        (call[0] as { headers: { Authorization: string } }).headers.Authorization ===
        'Bearer access-2'
    );
    expect(retries).toHaveLength(2);
  });

  it('builds a PKCE authorize URL and exchanges the returned code', async () => {
    const store = new Map<string, string>();
    preferences.set.mockImplementation(async ({ key, value }) => {
      store.set(key, value);
    });
    preferences.get.mockImplementation(async ({ key }) => ({ value: store.get(key) ?? null }));
    preferences.remove.mockImplementation(async ({ key }) => {
      store.delete(key);
    });

    const { beginProviderSignIn, completeProviderSignIn } = await sessionModule();

    const url = await beginProviderSignIn('google');
    const parsed = new URL(url);
    expect(parsed.pathname).toBe('/auth/v1/authorize');
    expect(parsed.searchParams.get('provider')).toBe('google');
    expect(parsed.searchParams.get('redirect_to')).toBe('royar://auth/callback');
    expect(parsed.searchParams.get('code_challenge_method')).toBe('s256');
    expect(parsed.searchParams.get('code_challenge')).toBeTruthy();
    expect(url).not.toContain('access-token');
    expect(url).not.toContain('refresh-token');

    httpPost.mockResolvedValueOnce(expiredResponse('provider'));
    const state = parsed.searchParams.get('state') ?? '';
    const session = await completeProviderSignIn(
      `royar://auth/callback?code=code-1&state=${encodeURIComponent(state)}`
    );

    expect(session?.email).toBe('a@b.c');
    expect(httpPost).toHaveBeenCalledWith(
      expect.objectContaining({ url: expect.stringContaining('grant_type=pkce') })
    );
    const body = httpPost.mock.calls[0]?.[0] as { data: Record<string, string> };
    expect(body.data.auth_code).toBe('code-1');
    expect(body.data.code_verifier).toBeTruthy();
    // The verifier is one-shot: a replay has nothing to exchange.
    await expect(
      completeProviderSignIn(`royar://auth/callback?code=code-2&state=${encodeURIComponent(state)}`)
    ).rejects.toThrow('no pending sign-in');
  });

  it('clears the token on sign-out without touching other preferences', async () => {
    preferences.get.mockResolvedValue({ value: 'refresh-stored' });
    httpPost.mockResolvedValueOnce(expiredResponse('1'));

    const { restoreSession, signOut, spikeSession } = await sessionModule();
    await restoreSession();
    await signOut();

    expect(spikeSession()).toBeNull();
    expect(preferences.remove).toHaveBeenCalledWith({
      key: 'royaraqamia.session.refresh-token',
    });
    expect(preferences.remove).toHaveBeenCalledWith({ key: 'royaraqamia.session.pkce' });
  });
});

describe('secure storage', () => {
  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'Capacitor');
  });

  it('keeps the refresh token in the platform secure store, not Preferences', async () => {
    const secure = {
      setData: vi.fn(async (_options: { key: string; value: string }) => {}),
      getData: vi.fn(async (_options: { key: string }) => ({ value: null as string | null })),
      deleteData: vi.fn(async (_options: { key: string }) => {}),
    };
    (globalThis as typeof globalThis & { Capacitor?: unknown }).Capacitor = {
      Plugins: { NativeBiometric: secure },
    };

    httpPost.mockResolvedValueOnce(tokenResponse());
    const { signIn } = await sessionModule();
    await signIn('a@b.c', 'secret');

    expect(secure.setData).toHaveBeenCalledWith({
      key: 'royaraqamia.session.refresh-token',
      value: 'refresh-1',
    });
    expect(preferences.set).not.toHaveBeenCalledWith(
      expect.objectContaining({ value: 'refresh-1' })
    );
  });
});
