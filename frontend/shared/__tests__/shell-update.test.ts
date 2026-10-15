import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The page's view of the shell's update channel (ADR-0043): a token in the user
 * agent, the manifest on the page's own origin, and a decision that must never
 * invent an update. Module state is per-test, hence `resetModules` plus a dynamic
 * import.
 */
async function loadModule() {
  vi.resetModules();
  return import('@/frontend/shared/shell-update');
}

const BROWSER_UA =
  'Mozilla/5.0 (Linux; Android 11; sdk_gphone_x86) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/83.0.4103.106 Mobile Safari/537.36';
const SHELL_UA = `${BROWSER_UA} RoyaraqamiaShell/20000`;

const respond = (payload: unknown, ok = true, status = 200) =>
  vi.fn(async () => ({
    ok,
    status,
    json: async () => payload,
  })) as unknown as typeof fetch;

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('shellVersionFromUserAgent', () => {
  it('reads the version the shell names itself by', async () => {
    const { shellVersionFromUserAgent } = await loadModule();

    expect(shellVersionFromUserAgent(SHELL_UA)).toBe(20000);
    expect(shellVersionFromUserAgent(`${BROWSER_UA} RoyaraqamiaShell/7`)).toBe(7);
  });

  it('finds no shell in an ordinary browser', async () => {
    const { shellVersionFromUserAgent } = await loadModule();

    expect(shellVersionFromUserAgent(BROWSER_UA)).toBeNull();
    expect(shellVersionFromUserAgent('')).toBeNull();
    expect(shellVersionFromUserAgent('RoyaraqamiaShell/')).toBeNull();
    expect(shellVersionFromUserAgent('RoyaraqamiaShell/abc')).toBeNull();
    // Another product is not this shell.
    expect(shellVersionFromUserAgent('SomethingElse/20000')).toBeNull();
  });
});

describe('toShellUpdateState', () => {
  const manifest = { versionCode: 20001, minSupportedVersionCode: 20000 };

  it('reports a newer published APK', async () => {
    const { toShellUpdateState } = await loadModule();

    expect(toShellUpdateState(manifest, 20000)).toEqual({
      updatePending: true,
      unsupported: false,
      installedCode: 20000,
      latestCode: 20001,
    });
  });

  it('reports nothing when the shell is current or ahead', async () => {
    const { toShellUpdateState } = await loadModule();

    expect(toShellUpdateState({ versionCode: 20000 }, 20000).updatePending).toBe(false);
    expect(toShellUpdateState({ versionCode: 19999 }, 20000).updatePending).toBe(false);
  });

  it('reports an unsupported shell', async () => {
    const { toShellUpdateState } = await loadModule();

    const state = toShellUpdateState({ versionCode: 20010, minSupportedVersionCode: 20005 }, 20000);
    expect(state.updatePending).toBe(true);
    expect(state.unsupported).toBe(true);
  });

  it('never invents an update from a manifest it cannot read', async () => {
    const { toShellUpdateState, SHELL_UPDATE_IDLE } = await loadModule();

    expect(toShellUpdateState(null, 20000).updatePending).toBe(false);
    expect(toShellUpdateState({}, 20000).updatePending).toBe(false);
    expect(toShellUpdateState({ versionCode: '20001' }, 20000).updatePending).toBe(false);
    expect(toShellUpdateState(manifest, null)).toEqual(SHELL_UPDATE_IDLE);
  });
});

describe('fetchShellManifest', () => {
  it('reads the published APK from beside the site, uncached', async () => {
    const { fetchShellManifest } = await loadModule();
    const fetchImpl = respond({
      versionCode: 20001,
      versionName: '1.93.0+shell.20001',
      apkUrl:
        'https://github.com/royaraqamia/royaraqamia/releases/download/shell/royaraqamia-shell.apk',
      minSupportedVersionCode: 20000,
    });

    const manifest = await fetchShellManifest({ fetchImpl });

    expect(fetchImpl).toHaveBeenCalledWith('/android/latest.json', { cache: 'no-store' });
    expect(manifest).toEqual({
      versionCode: 20001,
      versionName: '1.93.0+shell.20001',
      apkUrl:
        'https://github.com/royaraqamia/royaraqamia/releases/download/shell/royaraqamia-shell.apk',
      minSupportedVersionCode: 20000,
    });
  });

  it('keeps only an https download target', async () => {
    const { fetchShellManifest } = await loadModule();

    const insecure = await fetchShellManifest({
      fetchImpl: respond({ apkUrl: 'http://example.com/app.apk' }),
    });
    expect(insecure?.apkUrl).toBeNull();

    const absent = await fetchShellManifest({ fetchImpl: respond({}) });
    expect(absent).toEqual({
      versionCode: 0,
      versionName: null,
      apkUrl: null,
      minSupportedVersionCode: 0,
    });
  });

  it('reads as absent when the manifest is missing or unreadable', async () => {
    const { fetchShellManifest } = await loadModule();

    expect(await fetchShellManifest({ fetchImpl: respond({}, false, 404) })).toBeNull();
    expect(
      await fetchShellManifest({
        fetchImpl: vi.fn(async () => {
          throw new Error('offline');
        }) as unknown as typeof fetch,
      })
    ).toBeNull();
  });
});

describe('refreshShellUpdate', () => {
  it('does not even ask in a browser', async () => {
    const { refreshShellUpdate, getShellUpdateState } = await loadModule();
    const fetchImpl = respond({ versionCode: 99999 });

    await refreshShellUpdate({ userAgent: BROWSER_UA, fetchImpl });

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(getShellUpdateState().updatePending).toBe(false);
  });

  it('reads the manifest from the page’s own origin, uncached', async () => {
    const { refreshShellUpdate, getShellUpdateState } = await loadModule();
    const fetchImpl = respond({ versionCode: 20001, minSupportedVersionCode: 20000 });

    await refreshShellUpdate({ userAgent: SHELL_UA, fetchImpl });

    expect(fetchImpl).toHaveBeenCalledWith('/android/latest.json', { cache: 'no-store' });
    expect(getShellUpdateState()).toEqual({
      updatePending: true,
      unsupported: false,
      installedCode: 20000,
      latestCode: 20001,
    });
  });

  it('stays quiet when the manifest is missing or unreadable', async () => {
    const missing = await loadModule();
    await missing.refreshShellUpdate({ userAgent: SHELL_UA, fetchImpl: respond({}, false, 404) });
    expect(missing.getShellUpdateState().updatePending).toBe(false);
    expect(missing.getShellUpdateState().installedCode).toBe(20000);

    const broken = await loadModule();
    const throwing = vi.fn(async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;
    await broken.refreshShellUpdate({ userAgent: SHELL_UA, fetchImpl: throwing });
    expect(broken.getShellUpdateState().updatePending).toBe(false);
    expect(broken.getShellUpdateState().installedCode).toBe(20000);
  });
});

describe('the store', () => {
  it('notifies subscribers on a change, and only then', async () => {
    const { refreshShellUpdate, subscribeShellUpdate, getShellUpdateState } = await loadModule();
    const notified = vi.fn();
    const unsubscribe = subscribeShellUpdate(notified);

    await refreshShellUpdate({ userAgent: SHELL_UA, fetchImpl: respond({ versionCode: 20001 }) });
    expect(notified).toHaveBeenCalledTimes(1);
    expect(getShellUpdateState().updatePending).toBe(true);

    await refreshShellUpdate({ userAgent: SHELL_UA, fetchImpl: respond({ versionCode: 20001 }) });
    expect(notified).toHaveBeenCalledTimes(1);

    unsubscribe();
  });

  it('looks once when the observer attaches', async () => {
    const { observeShellUpdate } = await loadModule();
    const fetchImpl = respond({ versionCode: 20001 });
    vi.stubGlobal('fetch', fetchImpl);
    // The observer reads the user agent it is actually running under, which in
    // this environment is a plain jsdom browser until a test says otherwise.
    const userAgent = Object.getOwnPropertyDescriptor(navigator, 'userAgent');
    Object.defineProperty(navigator, 'userAgent', { value: SHELL_UA, configurable: true });

    const dispose = observeShellUpdate();
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1));

    dispose();
    if (userAgent) Object.defineProperty(navigator, 'userAgent', userAgent);
    vi.unstubAllGlobals();
  });
});
