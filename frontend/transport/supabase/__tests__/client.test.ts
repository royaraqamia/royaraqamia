import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createBrowserClientMock } = vi.hoisted(() => ({
  createBrowserClientMock: vi.fn((_url: string, _key: string, _options?: unknown) => ({
    auth: {},
  })),
}));

vi.mock('@supabase/ssr', () => ({ createBrowserClient: createBrowserClientMock }));

/** The client promise is cached per page, so every case loads a fresh module. */
async function loadClient() {
  vi.resetModules();
  return import('@/frontend/transport/supabase/client');
}

beforeEach(() => {
  createBrowserClientMock.mockClear();
});

describe('the browser client', () => {
  it('keeps the socket a whole tab after the last channel leaves', async () => {
    const { createClient, REALTIME_TAB_IDLE_MS } = await loadClient();

    await createClient();

    const options = createBrowserClientMock.mock.calls[0]?.[2] as {
      realtime?: { disconnectOnEmptyChannelsAfterMs?: number };
    };
    expect(options.realtime?.disconnectOnEmptyChannelsAfterMs).toBe(REALTIME_TAB_IDLE_MS);
    expect(REALTIME_TAB_IDLE_MS).toBeGreaterThanOrEqual(60 * 60 * 1000);
  });

  it('resolves one client per page, however many ask', async () => {
    const { createClient } = await loadClient();

    const [first, second] = await Promise.all([createClient(), createClient()]);

    expect(first).toBe(second);
    expect(createBrowserClientMock).toHaveBeenCalledTimes(1);
  });
});
