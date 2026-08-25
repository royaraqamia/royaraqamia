import type {
  AvailabilitySlot,
  ConsultationBooking,
  ConsultationBookingStatus,
  ConsultationPackage,
  ConsultationSettings,
} from '@/shared/contracts/consultation';
import { request } from '@/frontend/transport/http';

export interface AdminActionResult<T = unknown> {
  success: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
  data?: T;
}

export async function adminListBookings(
  page = 1,
  pageSize = 50,
  status?: ConsultationBookingStatus
): Promise<{ data: ConsultationBooking[]; total: number }> {
  const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
  if (status) params.set('status', status);
  try {
    return await request(`/api/consultation/admin/bookings?${params.toString()}`);
  } catch {
    return { data: [], total: 0 };
  }
}

export async function adminBookingAction(
  bookingId: string,
  action: 'confirm' | 'reject',
  rejectedReason?: string
): Promise<AdminActionResult> {
  try {
    return await request(`/api/consultation/admin/bookings/${encodeURIComponent(bookingId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ action, rejected_reason: rejectedReason }),
    });
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'فشل الإجراء' };
  }
}

export async function adminListSlots(
  fromIso?: string
): Promise<Array<AvailabilitySlot & { active_booking_id: string | null }>> {
  const query = fromIso ? `?from=${encodeURIComponent(fromIso)}` : '';
  try {
    const data = await request<{
      slots: Array<AvailabilitySlot & { active_booking_id: string | null }>;
    }>(`/api/consultation/admin/slots${query}`);
    return data.slots ?? [];
  } catch {
    return [];
  }
}

export async function adminCreateSlot(input: {
  starts_at: string;
  ends_at: string;
}): Promise<AdminActionResult<AvailabilitySlot>> {
  try {
    return await request('/api/consultation/admin/slots', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'فشل إضافة الموعد' };
  }
}

export async function adminDeleteSlot(slotId: string): Promise<AdminActionResult> {
  try {
    return await request(`/api/consultation/admin/slots/${encodeURIComponent(slotId)}`, {
      method: 'DELETE',
    });
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'فشل حذف الموعد' };
  }
}

export async function adminListPackages(): Promise<ConsultationPackage[]> {
  try {
    const data = await request<{ packages: ConsultationPackage[] }>(
      '/api/consultation/admin/packages'
    );
    return data.packages ?? [];
  } catch {
    return [];
  }
}

function packagePayload(input: {
  name: string;
  description?: string | null;
  price_usd: number;
  duration_minutes: number;
  sessions_count: number;
  is_active: boolean;
  sort_order: number;
}) {
  return JSON.stringify({
    name: input.name,
    description: input.description ?? null,
    price_usd: input.price_usd,
    duration_minutes: input.duration_minutes,
    sessions_count: input.sessions_count,
    is_active: input.is_active,
    sort_order: input.sort_order,
  });
}

export async function adminCreatePackage(
  input: Parameters<typeof packagePayload>[0]
): Promise<AdminActionResult<ConsultationPackage>> {
  try {
    return await request('/api/consultation/admin/packages', {
      method: 'POST',
      body: packagePayload(input),
    });
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'فشل إنشاء الباقة' };
  }
}

export async function adminUpdatePackage(
  id: string,
  input: Parameters<typeof packagePayload>[0]
): Promise<AdminActionResult<ConsultationPackage>> {
  try {
    return await request(`/api/consultation/admin/packages/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: packagePayload(input),
    });
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'فشل تحديث الباقة' };
  }
}

export async function adminDeletePackage(id: string): Promise<AdminActionResult> {
  try {
    return await request(`/api/consultation/admin/packages/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'فشل حذف الباقة' };
  }
}

export async function adminSaveSettings(
  entries: Partial<ConsultationSettings>
): Promise<AdminActionResult> {
  try {
    return await request('/api/consultation/admin/settings', {
      method: 'PUT',
      body: JSON.stringify(entries),
    });
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'فشل حفظ الإعدادات' };
  }
}
