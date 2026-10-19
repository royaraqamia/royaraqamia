import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  DEVICE_WAKE_PATH,
  requestDeviceWake,
  resetDeviceWakeThrottle,
} from '@/frontend/shared/local-store/device-wake';
import { NATIVE_PUSH_TOKEN_KEY } from '@/frontend/shared/native-push-token';

/**
 * The "this account just moved" ping (ADR-0060). It is best-effort by contract,
 * so what is worth pinning is exactly that: it never throws into a flush, it
 * collapses a burst, it leaves this device out of its own wake, and a realm with
 * no token (a browser tab, a service worker) still wakes the phones.
 */
describe('requestDeviceWake', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetDeviceWakeThrottle();
    globalThis.localStorage?.clear();
  });

  afterEach(() => {
    resetDeviceWakeThrottle();
    vi.useRealTimers();
  });

  function okResponse() {
    return { ok: true, status: 202 } as unknown as Response;
  }

  it('asks once for a burst of commits', async () => {
    const fetchImpl = vi.fn(async () => okResponse());

    requestDeviceWake({ fetchImpl });
    requestDeviceWake({ fetchImpl });
    requestDeviceWake({ fetchImpl });
    await vi.advanceTimersByTimeAsync(1_000);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledWith(
      DEVICE_WAKE_PATH,
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('sends this device’s own token, so the writer is left out of its own wake', async () => {
    const fetchImpl = vi.fn(async () => okResponse());
    globalThis.localStorage.setItem(NATIVE_PUSH_TOKEN_KEY, 'device-token');

    requestDeviceWake({ fetchImpl });
    await vi.advanceTimersByTimeAsync(1_000);

    expect(fetchImpl).toHaveBeenCalledWith(
      DEVICE_WAKE_PATH,
      expect.objectContaining({ body: JSON.stringify({ token: 'device-token' }) })
    );
  });

  it('sends no token in a realm that has none, waking every native device', async () => {
    const fetchImpl = vi.fn(async () => okResponse());

    requestDeviceWake({ fetchImpl });
    await vi.advanceTimersByTimeAsync(1_000);

    expect(fetchImpl).toHaveBeenCalledWith(
      DEVICE_WAKE_PATH,
      expect.objectContaining({ body: '{}' })
    );
  });

  it('swallows a refused request, because a wake is latency and not correctness', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('offline');
    });

    requestDeviceWake({ fetchImpl });
    await vi.advanceTimersByTimeAsync(1_000);

    // The attempt happened and nothing escaped: a dropped wake is late, not lost.
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('stays quiet inside the cooldown, so a steady writer cannot buzz forever', async () => {
    const fetchImpl = vi.fn(async () => okResponse());

    requestDeviceWake({ fetchImpl });
    await vi.advanceTimersByTimeAsync(1_000);
    requestDeviceWake({ fetchImpl });
    await vi.advanceTimersByTimeAsync(5_000);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('asks again once the cooldown has passed', async () => {
    const fetchImpl = vi.fn(async () => okResponse());

    requestDeviceWake({ fetchImpl });
    await vi.advanceTimersByTimeAsync(1_000);
    await vi.advanceTimersByTimeAsync(31_000);
    requestDeviceWake({ fetchImpl });
    await vi.advanceTimersByTimeAsync(1_000);

    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});
