import * as Sentry from '@sentry/nextjs';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { z } from 'zod';
import type { Database } from '@/backend/models/database.types';
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
import { getAuthUser } from '@/backend/middleware/auth-guard';
import { requireAdminAuth } from '@/backend/middleware/admin-auth-guard';
import {
  createAdminConsultationService,
  createSettingsReaderService,
  createUserConsultationService,
} from '@/backend/config/consultation';
import {
  BookingStateError,
  ConsultationValidationError,
  PackageInUseError,
  SlotReservedError,
  SlotTakenError,
} from '@/backend/services/consultation/consultation-service';

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------

function zodFieldErrors(error: z.ZodError): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || 'form';
    if (!fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  return fieldErrors;
}

function bookingErrorResponse(error: unknown): HttpResult | null {
  if (error instanceof ConsultationValidationError) {
    return jsonResult(400, { success: false, error: toBookingErrorMessage(error.message) });
  }
  if (error instanceof SlotTakenError || error instanceof BookingStateError) {
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

async function withAuthenticatedUser(
  run: (userId: string, supabase: SupabaseClient<Database>) => Promise<HttpResult>
): Promise<HttpResult> {
  try {
    const { user, supabase } = await getAuthUser();
    const userId = user?.id ?? null;
    if (!userId) {
      return jsonResult(401, { success: false, error: 'يجب تسجيل الدخول أولًا.' });
    }
    return await run(userId, supabase as unknown as SupabaseClient<Database>);
  } catch (error) {
    Sentry.captureException(error);
    const mapped = bookingErrorResponse(error);
    if (mapped) return mapped;
    return jsonResult(500, {
      success: false,
      error: 'حدث خطأ غير متوقع. الرجاء المحاولة مرة أخرى.',
    });
  }
}

// ------------------------------------------------------------
// Public endpoints (authenticated bookers; payment config is display data)
// ------------------------------------------------------------

export async function listConsultationPackages(): Promise<HttpResult> {
  try {
    const packages = await createSettingsReaderService().getActivePackages();
    return jsonResult(200, { packages });
  } catch (error) {
    Sentry.captureException(error);
    return jsonResult(200, { packages: [] });
  }
}

export async function listAvailableSlots(): Promise<HttpResult> {
  return withAuthenticatedUser(async (_userId, supabase) => {
    const slots = await createUserConsultationService(supabase).getAvailableSlots();
    return jsonResult(200, { slots });
  });
}

export async function listMyBookings(): Promise<HttpResult> {
  return withAuthenticatedUser(async (userId, supabase) => {
    const bookings = await createUserConsultationService(supabase).getMyBookings(userId);
    return jsonResult(200, { bookings });
  });
}

export async function createBooking(body: unknown): Promise<HttpResult> {
  const parsed = CreateBookingSchema.safeParse(body);
  if (!parsed.success) {
    return jsonResult(400, {
      success: false,
      error: 'تحقق من الحقول المدخلة.',
      fieldErrors: zodFieldErrors(parsed.error),
    });
  }

  return withAuthenticatedUser(async (userId, supabase) => {
    const bookingId = await createUserConsultationService(supabase).createBooking(
      userId,
      parsed.data
    );
    return jsonResult(200, { success: true, bookingId });
  });
}

export async function cancelMyBooking(bookingId: string): Promise<HttpResult> {
  return withAuthenticatedUser(async (userId, supabase) => {
    await createUserConsultationService(supabase).cancelBooking(userId, bookingId);
    return jsonResult(200, { success: true });
  });
}

export async function confirmReceiptSent(bookingId: string): Promise<HttpResult> {
  return withAuthenticatedUser(async (userId, supabase) => {
    await createUserConsultationService(supabase).markReceiptSent(userId, bookingId);
    return jsonResult(200, { success: true });
  });
}

export async function getPaymentConfig(): Promise<HttpResult> {
  try {
    const settings = await createSettingsReaderService().getSettings();
    return jsonResult(200, { settings });
  } catch (error) {
    Sentry.captureException(error);
    return jsonResult(200, { settings: {} });
  }
}

// ------------------------------------------------------------
// Admin endpoints
// ------------------------------------------------------------

const BOOKING_STATUSES = new Set([
  'pending_payment',
  'awaiting_review',
  'confirmed',
  'rejected',
  'cancelled',
  'expired',
]);

export async function adminListBookings(
  page: number,
  pageSize: number,
  status?: string | null
): Promise<HttpResult> {
  try {
    await requireAdminAuth();
    const validStatus =
      status && BOOKING_STATUSES.has(status) ? (status as ConsultationBookingStatus) : undefined;
    const result = await createAdminConsultationService().adminListBookings(
      page,
      pageSize,
      validStatus
    );
    return jsonResult(200, result);
  } catch (error) {
    Sentry.captureException(error);
    return jsonResult(500, { data: [], total: 0 });
  }
}

export async function adminBookingAction(bookingId: string, body: unknown): Promise<HttpResult> {
  const parsed = BookingActionSchema.safeParse(body);
  if (!parsed.success) {
    return jsonResult(400, { success: false, error: 'إجراء غير معروف.' });
  }

  try {
    await requireAdminAuth();
    const service = createAdminConsultationService();
    if (parsed.data.action === 'confirm') {
      await service.adminConfirmBooking(bookingId);
    } else {
      await service.adminRejectBooking(bookingId, parsed.data.rejected_reason);
    }
    return jsonResult(200, { success: true });
  } catch (error) {
    Sentry.captureException(error);
    return jsonResult(500, { success: false, error: 'تعذر تنفيذ الإجراء على الحجز.' });
  }
}

export async function adminListSlots(from?: string | null): Promise<HttpResult> {
  try {
    await requireAdminAuth();
    const slots = await createAdminConsultationService().adminListSlots(from ?? undefined);
    return jsonResult(200, { slots });
  } catch (error) {
    Sentry.captureException(error);
    return jsonResult(200, { slots: [] });
  }
}

export async function adminCreateSlot(body: unknown): Promise<HttpResult> {
  const parsed = SlotCreateSchema.safeParse(body);
  if (!parsed.success) {
    return jsonResult(400, {
      success: false,
      error: 'توقيت الموعد غير صحيح.',
      fieldErrors: zodFieldErrors(parsed.error),
    });
  }

  try {
    await requireAdminAuth();
    const slot = await createAdminConsultationService().adminCreateSlot(parsed.data);
    return jsonResult(200, { success: true, slot });
  } catch (error) {
    Sentry.captureException(error);
    const mapped = bookingErrorResponse(error);
    if (mapped) return mapped;
    return jsonResult(500, { success: false, error: 'تعذر إضافة الموعد.' });
  }
}

export async function adminDeleteSlot(slotId: string): Promise<HttpResult> {
  try {
    await requireAdminAuth();
    await createAdminConsultationService().adminDeleteSlot(slotId);
    return jsonResult(200, { success: true });
  } catch (error) {
    Sentry.captureException(error);
    const mapped = bookingErrorResponse(error);
    if (mapped) return mapped;
    return jsonResult(500, { success: false, error: 'تعذر حذف الموعد.' });
  }
}

export async function adminListPackages(): Promise<HttpResult> {
  try {
    await requireAdminAuth();
    const packages = await createAdminConsultationService().adminListPackages();
    return jsonResult(200, { packages });
  } catch (error) {
    Sentry.captureException(error);
    return jsonResult(200, { packages: [] });
  }
}

export async function adminCreatePackage(body: unknown): Promise<HttpResult> {
  const parsed = PackageUpsertSchema.safeParse(body);
  if (!parsed.success) {
    return jsonResult(400, {
      success: false,
      error: 'بيانات الباقة غير مكتملة.',
      fieldErrors: zodFieldErrors(parsed.error),
    });
  }

  try {
    await requireAdminAuth();
    const pkg = await createAdminConsultationService().adminCreatePackage(parsed.data);
    return jsonResult(200, { success: true, package: pkg });
  } catch (error) {
    Sentry.captureException(error);
    return jsonResult(500, { success: false, error: 'تعذر إنشاء الباقة.' });
  }
}

export async function adminUpdatePackage(packageId: string, body: unknown): Promise<HttpResult> {
  const parsed = PackageUpsertSchema.safeParse(body);
  if (!parsed.success) {
    return jsonResult(400, {
      success: false,
      error: 'بيانات الباقة غير مكتملة.',
      fieldErrors: zodFieldErrors(parsed.error),
    });
  }

  try {
    await requireAdminAuth();
    const pkg = await createAdminConsultationService().adminUpdatePackage(packageId, parsed.data);
    return jsonResult(200, { success: true, package: pkg });
  } catch (error) {
    Sentry.captureException(error);
    return jsonResult(500, { success: false, error: 'تعذر تحديث الباقة.' });
  }
}

export async function adminDeletePackage(packageId: string): Promise<HttpResult> {
  try {
    await requireAdminAuth();
    await createAdminConsultationService().adminDeletePackage(packageId);
    return jsonResult(200, { success: true });
  } catch (error) {
    Sentry.captureException(error);
    const mapped = bookingErrorResponse(error);
    if (mapped) return mapped;
    return jsonResult(500, { success: false, error: 'تعذر حذف الباقة.' });
  }
}

export async function adminSaveSettings(body: unknown): Promise<HttpResult> {
  const parsed = ConsultationSettingsSchema.partial().safeParse(body);
  if (!parsed.success || Object.keys(parsed.data).length === 0) {
    return jsonResult(400, {
      success: false,
      error: 'لا توجد قيم صالحة للحفظ.',
      fieldErrors: parsed.success ? undefined : zodFieldErrors(parsed.error),
    });
  }

  try {
    await requireAdminAuth();
    await createAdminConsultationService().saveSettings(parsed.data);
    return jsonResult(200, { success: true });
  } catch (error) {
    Sentry.captureException(error);
    return jsonResult(500, { success: false, error: 'تعذر حفظ الإعدادات.' });
  }
}
