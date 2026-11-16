import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as api from '@/frontend/api/home-services';
import * as session from '@/frontend/state/session-provider';
import { HomeServicesProvider, useHomeServices } from '@/frontend/state/home-services-provider';
import type { HomeServicesResult } from '@/shared/contracts/home-services';

vi.mock('@/frontend/state/session-provider', () => ({ useSession: vi.fn() }));
vi.mock('@/frontend/api/home-services', () => ({
  getHomeServices: vi.fn(),
  replaceHomeServices: vi.fn(),
}));

const useSession = vi.mocked(session.useSession);
const getHomeServices = vi.mocked(api.getHomeServices);
const replaceHomeServices = vi.mocked(api.replaceHomeServices);

const STORAGE_KEY = 'royaraqamia:home-services:v1';

function sessionSays(user: { id: string } | null, isLoading = false) {
  useSession.mockReturnValue({
    user,
    isLoading,
    session: null,
  } as unknown as ReturnType<typeof session.useSession>);
}

function renderProvider() {
  return renderHook(() => useHomeServices(), {
    wrapper: ({ children }) => <HomeServicesProvider>{children}</HomeServicesProvider>,
  });
}

/** A promise whose answer the test chooses, for the serialised-write case. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

/** The member's strip (ADR-0146), from an account, a device, or both. */
describe('HomeServicesProvider', () => {
  beforeEach(() => {
    window.localStorage.clear();
    useSession.mockReset();
    getHomeServices.mockReset();
    replaceHomeServices.mockReset();
  });

  it('renders the account’s order for a signed-in member', async () => {
    sessionSays({ id: 'abc' });
    getHomeServices.mockResolvedValue(['/quran', '/athkar']);

    const { result } = renderProvider();

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.order).toEqual(['/quran', '/athkar']);
  });

  it('merges the guest’s apps after the account’s and clears the device', async () => {
    sessionSays({ id: 'abc' });
    getHomeServices.mockResolvedValue(['/quran']);
    replaceHomeServices.mockResolvedValue({
      success: true,
      data: ['/quran', '/athkar'],
    });
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(['/athkar']));

    const { result } = renderProvider();

    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(replaceHomeServices).toHaveBeenCalledWith(['/quran', '/athkar']);
    expect(result.current.order).toEqual(['/quran', '/athkar']);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('keeps the device list when the account read fails', async () => {
    sessionSays({ id: 'abc' });
    getHomeServices.mockRejectedValue(new Error('offline'));
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(['/notes']));

    const { result } = renderProvider();

    await waitFor(() => expect(result.current.status).toBe('failed'));
    expect(result.current.order).toEqual(['/notes']);
  });

  it('adds a guest’s app to the device and to the strip', async () => {
    sessionSays(null);

    const { result } = renderProvider();
    await waitFor(() => expect(result.current.status).toBe('ready'));

    await act(async () => {
      await result.current.add('/notes');
    });

    expect(result.current.order).toEqual(['/notes']);
    expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '[]')).toEqual(['/notes']);
  });

  it('removes the app and restores the strip when the server refuses', async () => {
    sessionSays({ id: 'abc' });
    getHomeServices.mockResolvedValue(['/quran', '/athkar']);
    replaceHomeServices.mockResolvedValue({ success: false, error: 'تعذَّر الحفظ' });

    const { result } = renderProvider();
    await waitFor(() => expect(result.current.status).toBe('ready'));

    let message: string | null = null;
    await act(async () => {
      message = await result.current.remove('/quran');
    });

    expect(message).toBe('تعذَّر الحفظ');
    expect(result.current.order).toEqual(['/quran', '/athkar']);
  });

  it('reorders a guest’s strip on the device', async () => {
    sessionSays(null);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(['/quran', '/athkar', '/notes']));

    const { result } = renderProvider();
    await waitFor(() => expect(result.current.status).toBe('ready'));

    await act(async () => {
      await result.current.reorder(['/athkar', '/quran', '/notes']);
    });

    expect(result.current.order).toEqual(['/athkar', '/quran', '/notes']);
    expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '[]')).toEqual([
      '/athkar',
      '/quran',
      '/notes',
    ]);
  });

  it('writes reorders one at a time so two drops cannot land out of order', async () => {
    sessionSays({ id: 'abc' });
    getHomeServices.mockResolvedValue(['/quran', '/athkar']);

    const first = deferred<HomeServicesResult>();
    const second = deferred<HomeServicesResult>();
    replaceHomeServices.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);

    const { result } = renderProvider();
    await waitFor(() => expect(result.current.status).toBe('ready'));

    let firstWrite: Promise<string | null> = Promise.resolve(null);
    let secondWrite: Promise<string | null> = Promise.resolve(null);
    await act(async () => {
      firstWrite = result.current.reorder(['/athkar', '/quran']);
      secondWrite = result.current.reorder(['/quran', '/athkar']);
      await Promise.resolve();
    });

    // The second drop is drawn, but it waits for the first PUT to finish.
    expect(result.current.order).toEqual(['/quran', '/athkar']);
    expect(replaceHomeServices).toHaveBeenCalledTimes(1);
    expect(replaceHomeServices).toHaveBeenNthCalledWith(1, ['/athkar', '/quran']);

    await act(async () => {
      first.resolve({ success: true, data: ['/athkar', '/quran'] });
      await firstWrite;
    });
    expect(replaceHomeServices).toHaveBeenCalledTimes(2);

    await act(async () => {
      second.resolve({ success: true, data: ['/quran', '/athkar'] });
      await secondWrite;
    });
    expect(result.current.order).toEqual(['/quran', '/athkar']);
  });

  it('restores the confirmed order when a reorder is refused', async () => {
    sessionSays({ id: 'abc' });
    getHomeServices.mockResolvedValue(['/quran', '/athkar']);
    replaceHomeServices.mockResolvedValue({ success: false, error: 'تعذَّر الحفظ' });

    const { result } = renderProvider();
    await waitFor(() => expect(result.current.status).toBe('ready'));

    let message: string | null = null;
    await act(async () => {
      message = await result.current.reorder(['/athkar', '/quran']);
    });

    expect(message).toBe('تعذَّر الحفظ');
    expect(result.current.order).toEqual(['/quran', '/athkar']);
  });
});
