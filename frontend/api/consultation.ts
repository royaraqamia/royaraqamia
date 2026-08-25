import type {
  AvailabilitySlot,
  ConsultationBooking,
  ConsultationPackage,
  ConsultationSettings,
} from '@/shared/contracts/consultation';
import { request } from '@/frontend/transport/http';

export interface BookingActionResult {
  success: boolean;
  bookingId?: string;
  error?: string;
}

interface FieldErrorResponse {
  success: false;
  error?: string;
  fieldErrors?: Record<string, string>;
  bookingId?: string;
}

function toActionResult(data: unknown): BookingActionResult & {
  fieldErrors?: Record<string, string>;
} {
  const payload = data as FieldErrorResponse;
  return {
    success: Boolean(payload?.success),
    bookingId: payload?.bookingId,
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

export async function fetchMyBookings(): Promise<ConsultationBooking[]> {
  try {
    const data = await request<{ bookings: ConsultationBooking[] }>('/api/consultation/bookings');
    return data.bookings ?? [];
  } catch {
    return [];
  }
}

export async function fetchPaymentConfig(): Promise<Partial<ConsultationSettings>> {
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
  region: 'syria' | 'global';
  payment_method: 'shamcash' | 'moneygram';
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

export async function cancelMyBooking(bookingId: string): Promise<BookingActionResult> {
  try {
    return toActionResult(
      await request(`/api/consultation/bookings/${encodeURIComponent(bookingId)}/cancel`, {
        method: 'POST',
      })
    );
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'تعذر إلغاء الحجز.',
    };
  }
}

export async function confirmReceiptSent(bookingId: string): Promise<BookingActionResult> {
  try {
    return toActionResult(
      await request(`/api/consultation/bookings/${encodeURIComponent(bookingId)}/receipt`, {
        method: 'POST',
      })
    );
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'تعذر تأكيد الإرسال.',
    };
  }
}
