import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { AvailabilitySlot, ConsultationPackage } from '@/shared/contracts/consultation';

const { submitBooking, fetchAvailableSlots, fetchConsultationPackages } = vi.hoisted(() => ({
  submitBooking: vi.fn(),
  fetchAvailableSlots: vi.fn(),
  fetchConsultationPackages: vi.fn(),
}));

vi.mock('@/frontend/api/consultation', () => ({
  submitBooking,
  fetchAvailableSlots,
  fetchConsultationPackages,
}));

import { useBookingFlow } from '@/frontend/state/consultation/use-booking-flow';

const PACKAGE = {
  id: 'p-1',
  name: 'جلسة',
  sessions_count: 1,
  price_usd: 50,
  description: null,
  is_active: true,
} as unknown as ConsultationPackage;

function setOnline(value: boolean) {
  Object.defineProperty(navigator, 'onLine', { value, configurable: true });
}

describe('useBookingFlow offline behaviour', () => {
  beforeEach(() => {
    submitBooking.mockReset();
    fetchAvailableSlots.mockReset().mockResolvedValue([]);
    setOnline(true);
  });

  it('refuses to confirm offline and never calls the booking endpoint', async () => {
    const { result } = renderHook(() => useBookingFlow({ initialPackages: [PACKAGE] }));

    act(() => result.current.selectPackage(PACKAGE.id));
    await waitFor(() => expect(result.current.selectedPackage?.id).toBe(PACKAGE.id));

    setOnline(false);
    window.dispatchEvent(new Event('offline'));
    await waitFor(() => expect(result.current.online).toBe(false));

    await act(async () => {
      await result.current.confirmBooking();
    });

    expect(submitBooking).not.toHaveBeenCalled();
    expect(result.current.error).toMatch(/الاتصال/);
  });

  it('allows a confirm once a connection is present', async () => {
    submitBooking.mockResolvedValue({ success: true, bookingId: 'b-1', referenceCode: 'CON-1' });

    const { result } = renderHook(() => useBookingFlow({ initialPackages: [PACKAGE] }));
    act(() => result.current.selectPackage(PACKAGE.id));
    await waitFor(() => expect(result.current.selectedPackage?.id).toBe(PACKAGE.id));

    await act(async () => {
      await result.current.confirmBooking();
    });

    expect(submitBooking).toHaveBeenCalledTimes(1);
  });
});

/**
 * Availability and packages are live inventory. A request that never reached the
 * server must not come back as "none available": that is a claim about the
 * operator's calendar, and a failed request is in no position to make it
 * (ADR-0031).
 */
describe('useBookingFlow failed reads', () => {
  beforeEach(() => {
    submitBooking.mockReset();
    fetchAvailableSlots.mockReset();
    fetchConsultationPackages.mockReset().mockResolvedValue([]);
    setOnline(true);
  });

  async function toSlotsStep(flow: { current: ReturnType<typeof useBookingFlow> }) {
    act(() => flow.current.selectPackage(PACKAGE.id));
    await waitFor(() => expect(flow.current.selectedPackage?.id).toBe(PACKAGE.id));
    await act(async () => {
      flow.current.next();
    });
  }

  it('reports an unreachable availability read instead of an empty calendar', async () => {
    fetchAvailableSlots.mockRejectedValue(new Error('offline'));

    const { result } = renderHook(() => useBookingFlow({ initialPackages: [PACKAGE] }));
    await toSlotsStep(result);

    await waitFor(() => expect(result.current.slotsError).not.toBeNull());
    expect(result.current.slots).toEqual([]);
    // The step must not be able to read this as "no appointments are open".
    expect(result.current.slotsLoading).toBe(false);
  });

  it('clears the failure once the retry reaches the server', async () => {
    fetchAvailableSlots.mockRejectedValueOnce(new Error('offline'));
    fetchAvailableSlots.mockResolvedValue([{ id: 's-1' } as unknown as AvailabilitySlot]);

    const { result } = renderHook(() => useBookingFlow({ initialPackages: [PACKAGE] }));
    await toSlotsStep(result);
    await waitFor(() => expect(result.current.slotsError).not.toBeNull());

    await act(async () => {
      result.current.retrySlots();
    });

    await waitFor(() => expect(result.current.slotsError).toBeNull());
    expect(result.current.slots).toHaveLength(1);
  });

  it('reports an unreachable package read instead of an empty catalogue', async () => {
    fetchConsultationPackages.mockRejectedValue(new Error('offline'));

    const { result } = renderHook(() => useBookingFlow());

    await waitFor(() => expect(result.current.packagesError).not.toBeNull());
    expect(result.current.packages).toEqual([]);
  });
});
