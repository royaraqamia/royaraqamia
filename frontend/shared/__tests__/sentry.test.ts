import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  init: vi.fn(),
  captureException: vi.fn(),
  error: vi.fn(),
}));

vi.mock('@/frontend/shared/constants', () => ({ IS_PRODUCTION: true }));
vi.mock('@/frontend/shared/logger', () => ({ logger: { error: mocks.error } }));
vi.mock('@/backend/config/generated/app-version', () => ({
  appVersion: { releaseVersion: '1.0.0+test' },
}));

async function load() {
  vi.resetModules();
  mocks.init.mockClear();
  mocks.captureException.mockClear();
  mocks.error.mockClear();
  delete window.__RoyaSentry;
  return import('@/frontend/shared/sentry');
}

function fire(captured: Map<string, EventListener>, type: string, event: unknown) {
  (captured.get(type) as unknown as ((event: unknown) => void) | undefined)?.(event);
}

/** Install a reporter as if `public/sentry-client.js` had finished loading. */
function fakeReporter() {
  window.__RoyaSentry = {
    init: mocks.init,
    captureException: mocks.captureException,
  };
}

let addEventListenerSpy: ReturnType<typeof vi.spyOn>;
let appendChildSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  // Each case reloads the module, so a previous case's global listeners would
  // otherwise double-report the events dispatched here.
  addEventListenerSpy = vi.spyOn(window, 'addEventListener').mockImplementation(() => undefined);
  appendChildSpy = vi.spyOn(document.head, 'appendChild').mockImplementation((node: Node) => node);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('client Sentry reporter', () => {
  it('installs first-party listeners without requesting the SDK on a clean boot', async () => {
    const { initClientSentry } = await load();
    initClientSentry();

    expect(addEventListenerSpy.mock.calls.map((call: unknown[]) => call[0])).toEqual([
      'error',
      'unhandledrejection',
    ]);
    expect(appendChildSpy).not.toHaveBeenCalled();
    expect(mocks.init).not.toHaveBeenCalled();
    expect(mocks.captureException).not.toHaveBeenCalled();
  });

  it('injects the standalone bundle on the first event and keeps the monitoring tunnel', async () => {
    const { initClientSentry } = await load();
    const captured = new Map<string, EventListener>();
    vi.mocked(window.addEventListener).mockImplementation(((
      type: string,
      handler: EventListener
    ) => {
      captured.set(type, handler);
    }) as typeof window.addEventListener);
    appendChildSpy.mockImplementation((node: Node) => {
      const script = node as HTMLScriptElement;
      expect(script.src).toContain('/sentry-client.js');
      fakeReporter();
      script.onload?.(new Event('load'));
      return node;
    });
    initClientSentry();

    fire(captured, 'error', { error: new Error('boom') });
    await vi.waitFor(() => expect(mocks.captureException).toHaveBeenCalledTimes(1));

    expect(appendChildSpy).toHaveBeenCalledTimes(1);
    expect(mocks.init).toHaveBeenCalledTimes(1);
    expect(mocks.init.mock.calls[0]![0]).toMatchObject({
      integrations: [],
      tracesSampleRate: 0.01,
      tunnel: '/monitoring',
      release: '1.0.0+test',
    });
    expect(mocks.captureException.mock.calls[0]![1]).toEqual({
      extra: { source: 'window.onerror' },
    });
  });

  it('flushes several buffered events from a single reporter load', async () => {
    const { initClientSentry } = await load();
    const captured = new Map<string, EventListener>();
    vi.mocked(window.addEventListener).mockImplementation(((
      type: string,
      handler: EventListener
    ) => {
      captured.set(type, handler);
    }) as typeof window.addEventListener);
    fakeReporter();
    initClientSentry();

    fire(captured, 'error', { error: new Error('first') });
    fire(captured, 'unhandledrejection', { reason: new Error('second') });
    await vi.waitFor(() => expect(mocks.captureException).toHaveBeenCalledTimes(2));

    expect(appendChildSpy).not.toHaveBeenCalled();
    expect(mocks.init).toHaveBeenCalledTimes(1);
    expect(mocks.captureException.mock.calls).toHaveLength(2);
  });

  it('does not load the reporter for a router transition', async () => {
    const { captureRouterTransitionStart, captureClientError } = await load();
    captureRouterTransitionStart('/terms', 'push');

    expect(appendChildSpy).not.toHaveBeenCalled();
    expect(mocks.init).not.toHaveBeenCalled();

    fakeReporter();
    await captureClientError(new Error('explicit'));
    await vi.waitFor(() => expect(mocks.init).toHaveBeenCalledTimes(1));
    expect(mocks.captureException).toHaveBeenCalledTimes(1);
  });
});
