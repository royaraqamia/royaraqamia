import { describe, expect, it, vi, beforeEach } from 'vitest';

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
const browserOpen = vi.fn(async (_options: { url: string }) => {});

vi.mock('@capacitor/preferences', () => ({ Preferences: preferences }));
vi.mock('@capacitor/core', () => ({
  CapacitorHttp: { post: httpPost, get: httpGet },
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
      key: 'spike.refresh-token',
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
    expect(preferences.remove).toHaveBeenCalledWith({ key: 'spike.refresh-token' });
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
