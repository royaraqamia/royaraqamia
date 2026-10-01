import type {
  AvailabilitySlot,
  ConsultationBooking,
  ConsultationPackage,
  ConsultationSettings,
  UpdateBookingInput,
} from '@/shared/contracts/consultation';
import { request } from '@/frontend/transport/http';

export interface BookingActionResult {
  success: boolean;
  bookingId?: string;
  referenceCode?: string;
  error?: string;
}

interface FieldErrorResponse {
  success: false;
  error?: string;
  fieldErrors?: Record<string, string>;
  bookingId?: string;
  referenceCode?: string;
}

function toActionResult(data: unknown): BookingActionResult & {
  fieldErrors?: Record<string, string>;
} {
  const payload = data as FieldErrorResponse;
  return {
    success: Boolean(payload?.success),
    bookingId: payload?.bookingId,
    referenceCode: payload?.referenceCode,
    error: payload?.error,
    fieldErrors: payload?.fieldErrors,
  };
}

export async function fetchConsultationPackages(): Promise<ConsultationPackage[]> {
  try {
    const data = await request<{ packages: ConsultationPackage[] }>('/api/consultation/packages');
    return data.packages ?? [];
  } catch {
    return [];
  }
}

export async function fetchAvailableSlots(): Promise<AvailabilitySlot[]> {
  try {
    const data = await request<{ slots: AvailabilitySlot[] }>('/api/consultation/slots');
    return data.slots ?? [];
  } catch {
    return [];
  }
}

export async function fetchConsultationSettings(): Promise<Partial<ConsultationSettings>> {
  try {
    const data = await request<{ settings: Partial<ConsultationSettings> }>(
      '/api/consultation/settings'
    );
    return data.settings ?? {};
  } catch {
    return {};
  }
}

export async function submitBooking(input: {
  package_id: string;
  slot_ids: string[];
  full_name: string;
  phone_whatsapp: string;
  topic_description: string;
}): Promise<BookingActionResult & { fieldErrors?: Record<string, string> }> {
  try {
    return toActionResult(
      await request<BookingActionResult>('/api/consultation/bookings', {
        method: 'POST',
        body: JSON.stringify(input),
      })
    );
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'تعذر إنشاء الحجز، حاول مرة أخرى.',
    };
  }
}

export interface MyBookingUpdateResult {
  success: boolean;
  data?: ConsultationBooking;
  error?: string;
  fieldErrors?: Record<string, string>;
}

/**
 * The signed-in booker's own consultations. A failure degrades to an empty list
 * so the account page renders its empty state rather than an error screen.
 */
export async function getMyConsultationBookings(): Promise<ConsultationBooking[]> {
  try {
    const result = await request<{ success: boolean; data?: ConsultationBooking[] }>(
      '/api/me/consultation-bookings'
    );
    return result.data ?? [];
  } catch {
    return [];
  }
}

export async function updateMyConsultationBooking(
  id: string,
  input: UpdateBookingInput
): Promise<MyBookingUpdateResult> {
  try {
    return await request<MyBookingUpdateResult>(
      `/api/me/consultation-bookings/${encodeURIComponent(id)}`,
      { method: 'PATCH', body: JSON.stringify(input) }
    );
  } catch (error) {
    return error instanceof Error ? { success: false, error: error.message } : { success: false };
  }
}
