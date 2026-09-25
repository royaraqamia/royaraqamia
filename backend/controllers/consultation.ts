import * as Sentry from '@sentry/nextjs';
import {
  BookingActionSchema,
  ConsultationSettingsSchema,
  CreateBookingSchema,
  PackageUpsertSchema,
  SlotCreateSchema,
  toBookingErrorMessage,
  type ConsultationBookingStatus,
} from '@/shared/contracts/consultation';
import { jsonResult, type HttpResult } from '@/backend/transport/http-result';
import { withAdminUser } from '@/backend/transport/admin-handler';
import { getOptionalUser } from '@/backend/middleware/auth-guard';
import {
  createAdminConsultationService,
  createPublicConsultationService,
} from '@/backend/config/consultation';
import {
  loadActiveConsultationPackages,
  loadConsultationSettings,
} from '@/backend/loaders/consultation';
import { CONSULTATION_TAGS } from '@/backend/shared/consultation-cache-tags';
import { zodFieldErrors } from '@/backend/shared/zod-field-errors';
import {
  ConsultationRateLimitError,
  ConsultationValidationError,
  PackageInUseError,
  SlotReservedError,
  SlotTakenError,
} from '@/backend/services/consultation/consultation-service';

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------

function bookingErrorResponse(error: unknown): HttpResult | null {
  if (error instanceof ConsultationValidationError) {
    return jsonResult(400, { success: false, error: toBookingErrorMessage(error.message) });
  }
  if (error instanceof SlotTakenError) {
    return jsonResult(409, { success: false, error: toBookingErrorMessage(error.message) });
  }
  if (error instanceof PackageInUseError) {
    return jsonResult(409, {
      success: false,
      error: 'لا يمكن حذف باقة مرتبطة بحجوزات سابقة. عطِّلها بدلًا من حذفها.',
    });
  }
  if (error instanceof SlotReservedError) {
    return jsonResult(409, {
      success: false,
      error: 'لا يمكن حذف موعد محجوز حاليًا.',
    });
  }
  return null;
}

// ------------------------------------------------------------
// Public endpoints (anonymous bookers; no account, no payment)
// ------------------------------------------------------------

export async function listConsultationPackages(): Promise<HttpResult> {
  const packages = await loadActiveConsultationPackages();
  return jsonResult(
    200,
    { packages },
    {
      headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' },
      tags: [CONSULTATION_TAGS.packages],
    }
  );
}

export async function listAvailableSlots(): Promise<HttpResult> {
  try {
    const slots = await createPublicConsultationService().getAvailableSlots();
    return jsonResult(200, { slots });
  } catch (error) {
    Sentry.captureException(error);
    return jsonResult(200, { slots: [] });
  }
}

/**
 * Public and unauthenticated by design, exactly like a training application:
 * a consultation booking takes no payment and must not put a signup wall in
 * front of the visitor. Protected by a per-IP rate limit, and attributed to a
 * signed-in visitor opportunistically when a session happens to exist.
 */
export async function createBooking(body: unknown, ip: string): Promise<HttpResult> {
  const parsed = CreateBookingSchema.safeParse(body);
  if (!parsed.success) {
    return jsonResult(400, {
      success: false,
      error: 'تحقق من الحقول المدخلة.',
      fieldErrors: zodFieldErrors(parsed.error),
    });
  }

  try {
    const { user } = await getOptionalUser();
    const booking = await createPublicConsultationService().createBooking(parsed.data, {
      ip,
      userId: user?.id ?? null,
    });
    return jsonResult(200, {
      success: true,
      bookingId: booking.id,
      referenceCode: booking.referenceCode,
    });
  } catch (error) {
    Sentry.captureException(error);
    const mapped = bookingErrorResponse(error);
    if (mapped) return mapped;
    if (error instanceof ConsultationRateLimitError) {
      return jsonResult(429, { success: false, error: error.message });
    }
    return jsonResult(500, { success: false, error: 'تعذر إنشاء الحجز.' });
  }
}

export async function getConsultationSettings(): Promise<HttpResult> {
  const settings = await loadConsultationSettings();
  // No browser/CDN cache: the admin settings form reads this same endpoint
  // and must not see stale values right after saving.
  return jsonResult(200, { settings }, { tags: [CONSULTATION_TAGS.settings] });
}

// ------------------------------------------------------------
// Admin endpoints
// ------------------------------------------------------------

const BOOKING_STATUSES = new Set(['pending', 'confirmed', 'rejected', 'cancelled']);

export async function adminListBookings(
  page: number,
  pageSize: number,
  status?: string | null
): Promise<HttpResult> {
  return withAdminUser(
    async () => {
      const validStatus =
        status && BOOKING_STATUSES.has(status) ? (status as ConsultationBookingStatus) : undefined;
      const result = await createAdminConsultationService().adminListBookings(
        page,
        pageSize,
        validStatus
      );
      return jsonResult(200, result);
    },
    { whenFailed: { success: false, error: 'تعذر تحميل الحجوزات.' } }
  );
}

export async function adminBookingAction(bookingId: string, body: unknown): Promise<HttpResult> {
  return withAdminUser(
    async () => {
      const parsed = BookingActionSchema.safeParse(body);
      if (!parsed.success) {
        return jsonResult(400, { success: false, error: 'إجراء غير معروف.' });
      }

      const service = createAdminConsultationService();
      if (parsed.data.action === 'confirm') {
        await service.adminConfirmBooking(bookingId);
      } else {
        await service.adminRejectBooking(bookingId, parsed.data.rejected_reason);
      }
      return jsonResult(200, { success: true });
    },
    { whenFailed: { success: false, error: 'تعذر تنفيذ الإجراء على الحجز.' } }
  );
}

export async function adminListSlots(from?: string | null): Promise<HttpResult> {
  return withAdminUser(
    async () => {
      const slots = await createAdminConsultationService().adminListSlots(from ?? undefined);
      return jsonResult(200, { slots });
    },
    { whenFailed: { success: false, error: 'تعذر تحميل المواعيد.' } }
  );
}

export async function adminCreateSlot(body: unknown): Promise<HttpResult> {
  return withAdminUser(
    async () => {
      const parsed = SlotCreateSchema.safeParse(body);
      if (!parsed.success) {
        return jsonResult(400, {
          success: false,
          error: 'توقيت الموعد غير صحيح.',
          fieldErrors: zodFieldErrors(parsed.error),
        });
      }

      const slot = await createAdminConsultationService().adminCreateSlot(parsed.data);
      return jsonResult(200, { success: true, slot });
    },
    {
      mapError: bookingErrorResponse,
      whenFailed: { success: false, error: 'تعذر إضافة الموعد.' },
    }
  );
}

export async function adminDeleteSlot(slotId: string): Promise<HttpResult> {
  return withAdminUser(
    async () => {
      await createAdminConsultationService().adminDeleteSlot(slotId);
      return jsonResult(200, { success: true });
    },
    {
      mapError: bookingErrorResponse,
      whenFailed: { success: false, error: 'تعذر حذف الموعد.' },
    }
  );
}

export async function adminListPackages(): Promise<HttpResult> {
  return withAdminUser(
    async () => {
      const packages = await createAdminConsultationService().adminListPackages();
      return jsonResult(200, { packages });
    },
    { whenFailed: { success: false, error: 'تعذر تحميل الباقات.' } }
  );
}

export async function adminCreatePackage(body: unknown): Promise<HttpResult> {
  return withAdminUser(
    async () => {
      const parsed = PackageUpsertSchema.safeParse(body);
      if (!parsed.success) {
        return jsonResult(400, {
          success: false,
          error: 'بيانات الباقة غير مكتملة.',
          fieldErrors: zodFieldErrors(parsed.error),
        });
      }

      const pkg = await createAdminConsultationService().adminCreatePackage(parsed.data);
      return jsonResult(
        200,
        { success: true, package: pkg },
        { tags: [CONSULTATION_TAGS.packages] }
      );
    },
    { whenFailed: { success: false, error: 'تعذر إنشاء الباقة.' } }
  );
}

export async function adminUpdatePackage(packageId: string, body: unknown): Promise<HttpResult> {
  return withAdminUser(
    async () => {
      const parsed = PackageUpsertSchema.safeParse(body);
      if (!parsed.success) {
        return jsonResult(400, {
          success: false,
          error: 'بيانات الباقة غير مكتملة.',
          fieldErrors: zodFieldErrors(parsed.error),
        });
      }

      const pkg = await createAdminConsultationService().adminUpdatePackage(packageId, parsed.data);
      return jsonResult(
        200,
        { success: true, package: pkg },
        { tags: [CONSULTATION_TAGS.packages] }
      );
    },
    { whenFailed: { success: false, error: 'تعذر تحديث الباقة.' } }
  );
}

export async function adminDeletePackage(packageId: string): Promise<HttpResult> {
  return withAdminUser(
    async () => {
      await createAdminConsultationService().adminDeletePackage(packageId);
      return jsonResult(200, { success: true }, { tags: [CONSULTATION_TAGS.packages] });
    },
    {
      mapError: bookingErrorResponse,
      whenFailed: { success: false, error: 'تعذر حذف الباقة.' },
    }
  );
}

export async function adminSaveSettings(body: unknown): Promise<HttpResult> {
  return withAdminUser(
    async () => {
      const parsed = ConsultationSettingsSchema.partial().safeParse(body);
      if (!parsed.success || Object.keys(parsed.data).length === 0) {
        return jsonResult(400, {
          success: false,
          error: 'لا توجد قيم صالحة للحفظ.',
          fieldErrors: parsed.success ? undefined : zodFieldErrors(parsed.error),
        });
      }

      await createAdminConsultationService().saveSettings(parsed.data);
      return jsonResult(200, { success: true }, { tags: [CONSULTATION_TAGS.settings] });
    },
    { whenFailed: { success: false, error: 'تعذر حفظ الإعدادات.' } }
  );
}
