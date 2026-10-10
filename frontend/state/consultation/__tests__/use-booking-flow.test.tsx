import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { ConsultationPackage } from '@/shared/contracts/consultation';

const { submitBooking, fetchAvailableSlots } = vi.hoisted(() => ({
  submitBooking: vi.fn(),
  fetchAvailableSlots: vi.fn(),
}));

vi.mock('@/frontend/api/consultation', () => ({
  submitBooking,
  fetchAvailableSlots,
  fetchConsultationPackages: vi.fn(),
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
