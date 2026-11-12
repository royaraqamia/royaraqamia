import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createClientMock, connectMock } = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  connectMock: vi.fn(),
}));

vi.mock('@/frontend/transport/supabase/client', () => ({ createClient: createClientMock }));

/** The module caches "already scheduled" per page, so every case loads a fresh one. */
async function loadWarm() {
  vi.resetModules();
  const module = await import('@/frontend/transport/supabase/warm');
  return module.warmRealtimeSocket;
}

beforeEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  createClientMock.mockReset();
  connectMock.mockReset();
  createClientMock.mockResolvedValue({ realtime: { connect: connectMock } });
});

describe('warmRealtimeSocket', () => {
  it('opens the socket once the page is idle, not before', async () => {
    vi.useFakeTimers();
    const warm = await loadWarm();

    warm();
    expect(createClientMock).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(2_000);

    expect(createClientMock).toHaveBeenCalledTimes(1);
    expect(connectMock).toHaveBeenCalledTimes(1);
  });

  it('opens one socket however often the provider mounts', async () => {
    vi.useFakeTimers();
    const warm = await loadWarm();

    warm();
    warm();
    warm();
    await vi.advanceTimersByTimeAsync(2_000);

    expect(createClientMock).toHaveBeenCalledTimes(1);
  });

  it('uses an idle frame when the browser has one', async () => {
    const idle = vi.fn((callback: IdleRequestCallback) => {
      callback({ didTimeout: true, timeRemaining: () => 0 });
      return 1;
    });
    vi.stubGlobal('requestIdleCallback', idle);

    const warm = await loadWarm();
    warm();

    expect(idle).toHaveBeenCalledTimes(1);
    await Promise.resolve();
    expect(connectMock).toHaveBeenCalledTimes(1);
  });

  it('says nothing when the client cannot be created', async () => {
    vi.useFakeTimers();
    createClientMock.mockRejectedValue(new Error('no chunk'));
    const warm = await loadWarm();

    warm();
    await vi.advanceTimersByTimeAsync(2_000);
    expect(connectMock).not.toHaveBeenCalled();
  });
});
