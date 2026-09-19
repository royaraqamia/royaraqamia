import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockAdminListBookings = vi.fn();
const mockAdminConfirmBooking = vi.fn();
const mockAdminRejectBooking = vi.fn();
const mockAdminListSlots = vi.fn();
const mockAdminCreateSlot = vi.fn();
const mockAdminDeleteSlot = vi.fn();
const mockAdminListPackages = vi.fn();
const mockAdminCreatePackage = vi.fn();
const mockAdminUpdatePackage = vi.fn();
const mockAdminDeletePackage = vi.fn();
const mockSaveSettings = vi.fn();
const mockGetAvailableSlots = vi.fn();
const mockCreateBooking = vi.fn();
const mockLoadActivePackages = vi.fn();
const mockLoadSettings = vi.fn();
const mockGetOptionalUser = vi.fn();
const mockGetAuthUser = vi.fn();
const mockSyncAdminAllowlistMirror = vi.fn();

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));

vi.mock('@/backend/config/env', () => ({
  env: { adminEmails: ['admin@example.com'] },
}));

vi.mock('@/backend/middleware/auth-guard', () => ({
  getAuthUser: () => mockGetAuthUser(),
  getOptionalUser: () => mockGetOptionalUser(),
}));

vi.mock('@/backend/config/admin-allowlist', () => ({
  syncAdminAllowlistMirror: (emails: string[]) => mockSyncAdminAllowlistMirror(emails),
}));

vi.mock('@/backend/config/consultation', () => ({
  createAdminConsultationService: () => ({
    adminListBookings: mockAdminListBookings,
    adminConfirmBooking: mockAdminConfirmBooking,
    adminRejectBooking: mockAdminRejectBooking,
    adminListSlots: mockAdminListSlots,
    adminCreateSlot: mockAdminCreateSlot,
    adminDeleteSlot: mockAdminDeleteSlot,
    adminListPackages: mockAdminListPackages,
    adminCreatePackage: mockAdminCreatePackage,
    adminUpdatePackage: mockAdminUpdatePackage,
    adminDeletePackage: mockAdminDeletePackage,
    saveSettings: mockSaveSettings,
  }),
  createPublicConsultationService: () => ({
    getAvailableSlots: mockGetAvailableSlots,
    createBooking: mockCreateBooking,
  }),
}));

vi.mock('@/backend/loaders/consultation', () => ({
  loadActiveConsultationPackages: () => mockLoadActivePackages(),
  loadConsultationSettings: () => mockLoadSettings(),
}));

import {
  adminBookingAction,
  adminCreatePackage,
  adminCreateSlot,
  adminDeletePackage,
  adminDeleteSlot,
  adminListBookings,
  adminListPackages,
  adminListSlots,
  adminSaveSettings,
  adminUpdatePackage,
  createBooking,
  getConsultationSettings,
  listConsultationPackages,
} from '@/backend/controllers/consultation';
import {
  ConsultationValidationError,
  PackageInUseError,
  SlotReservedError,
  SlotTakenError,
} from '@/backend/services/consultation/consultation-service';
import type { HttpResult } from '@/backend/transport/http-result';

const BOOKING = { id: 'booking-1', reference_code: 'CONS-2026-A7K2M9QX', status: 'pending' };
const SLOT = {
  id: 'slot-1',
  starts_at: '2026-08-25T08:00:00.000Z',
  ends_at: '2026-08-25T09:00:00.000Z',
};
const PACKAGE = { id: 'pkg-1', name: 'باقة استشارة' };

const VALID_SLOT_BODY = {
  starts_at: '2026-08-25T08:00:00.000Z',
  ends_at: '2026-08-25T09:00:00.000Z',
};

const VALID_PACKAGE_BODY = {
  name: 'باقة استشارة',
  description: null,
  price_usd: 100,
  duration_minutes: 60,
  sessions_count: 1,
  is_active: true,
  sort_order: 0,
};

const ADMIN_SESSION = { user: { id: 'admin-1', email: 'admin@example.com' }, supabase: {} };
const NON_ADMIN_SESSION = { user: { id: 'u-2', email: 'user@example.com' }, supabase: {} };
const SIGNED_OUT = { user: null, supabase: {} };

function bodyOf(result: HttpResult): unknown {
  if ('redirect' in result) throw new Error('unexpected redirect');
  return result.body;
}

function resetMocks() {
  vi.clearAllMocks();
  mockGetAuthUser.mockResolvedValue(ADMIN_SESSION);
  mockSyncAdminAllowlistMirror.mockResolvedValue(undefined);
  mockGetOptionalUser.mockResolvedValue({ user: null, client: null });
  mockAdminListBookings.mockResolvedValue({ data: [BOOKING], total: 1 });
  mockAdminConfirmBooking.mockResolvedValue(undefined);
  mockAdminRejectBooking.mockResolvedValue(undefined);
  mockAdminListSlots.mockResolvedValue([SLOT]);
  mockAdminCreateSlot.mockResolvedValue(SLOT);
  mockAdminDeleteSlot.mockResolvedValue(undefined);
  mockAdminListPackages.mockResolvedValue([PACKAGE]);
  mockAdminCreatePackage.mockResolvedValue(PACKAGE);
  mockAdminUpdatePackage.mockResolvedValue(PACKAGE);
  mockAdminDeletePackage.mockResolvedValue(undefined);
  mockSaveSettings.mockResolvedValue(undefined);
  mockGetAvailableSlots.mockResolvedValue([SLOT]);
  mockCreateBooking.mockResolvedValue({ id: 'booking-1', referenceCode: 'CONS-2026-A7K2M9QX' });
  mockLoadActivePackages.mockResolvedValue([PACKAGE]);
  mockLoadSettings.mockResolvedValue({ booking_whatsapp_url: 'https://wa.me/963968478904' });
}

beforeEach(resetMocks);

describe('consultation admin authorization', () => {
  it('adminListBookings answers 401 signed out and never reaches the service', async () => {
    mockGetAuthUser.mockResolvedValue(SIGNED_OUT);

    const result = await adminListBookings(1, 20);

    expect(result).toMatchObject({ status: 401 });
    expect(mockAdminListBookings).not.toHaveBeenCalled();
    expect(mockSyncAdminAllowlistMirror).not.toHaveBeenCalled();
  });

  it('adminListBookings answers 403 for a signed-in non-admin and never reaches the service', async () => {
    mockGetAuthUser.mockResolvedValue(NON_ADMIN_SESSION);

    const result = await adminListBookings(1, 20);

    expect(result).toMatchObject({ status: 403 });
    expect(mockAdminListBookings).not.toHaveBeenCalled();
  });

  it('adminBookingAction answers 401 signed out before validating the body', async () => {
    mockGetAuthUser.mockResolvedValue(SIGNED_OUT);

    const result = await adminBookingAction('booking-1', { action: 'nope' });

    expect(result).toMatchObject({ status: 401 });
    expect(mockAdminConfirmBooking).not.toHaveBeenCalled();
    expect(mockAdminRejectBooking).not.toHaveBeenCalled();
  });

  it('adminBookingAction answers 403 for a signed-in non-admin', async () => {
    mockGetAuthUser.mockResolvedValue(NON_ADMIN_SESSION);

    const result = await adminBookingAction('booking-1', { action: 'nope' });

    expect(result).toMatchObject({ status: 403 });
    expect(mockAdminConfirmBooking).not.toHaveBeenCalled();
  });

  it('adminListSlots answers 401 signed out and never reaches the service', async () => {
    mockGetAuthUser.mockResolvedValue(SIGNED_OUT);

    const result = await adminListSlots();

    expect(result).toMatchObject({ status: 401 });
    expect(mockAdminListSlots).not.toHaveBeenCalled();
  });

  it('adminListSlots answers 403 for a signed-in non-admin', async () => {
    mockGetAuthUser.mockResolvedValue(NON_ADMIN_SESSION);

    const result = await adminListSlots();

    expect(result).toMatchObject({ status: 403 });
    expect(mockAdminListSlots).not.toHaveBeenCalled();
  });

  it('adminCreateSlot answers 401 signed out before validating the body', async () => {
    mockGetAuthUser.mockResolvedValue(SIGNED_OUT);

    const result = await adminCreateSlot({ starts_at: 'nope', ends_at: 'nope' });

    expect(result).toMatchObject({ status: 401 });
    expect(mockAdminCreateSlot).not.toHaveBeenCalled();
  });

  it('adminCreateSlot answers 403 for a signed-in non-admin', async () => {
    mockGetAuthUser.mockResolvedValue(NON_ADMIN_SESSION);

    const result = await adminCreateSlot({ starts_at: 'nope', ends_at: 'nope' });

    expect(result).toMatchObject({ status: 403 });
    expect(mockAdminCreateSlot).not.toHaveBeenCalled();
  });

  it('adminDeleteSlot answers 401 signed out and never reaches the service', async () => {
    mockGetAuthUser.mockResolvedValue(SIGNED_OUT);

    const result = await adminDeleteSlot('slot-1');

    expect(result).toMatchObject({ status: 401 });
    expect(mockAdminDeleteSlot).not.toHaveBeenCalled();
  });

  it('adminDeleteSlot answers 403 for a signed-in non-admin', async () => {
    mockGetAuthUser.mockResolvedValue(NON_ADMIN_SESSION);

    const result = await adminDeleteSlot('slot-1');

    expect(result).toMatchObject({ status: 403 });
    expect(mockAdminDeleteSlot).not.toHaveBeenCalled();
  });

  it('adminListPackages answers 401 signed out and never reaches the service', async () => {
    mockGetAuthUser.mockResolvedValue(SIGNED_OUT);

    const result = await adminListPackages();

    expect(result).toMatchObject({ status: 401 });
    expect(mockAdminListPackages).not.toHaveBeenCalled();
  });

  it('adminListPackages answers 403 for a signed-in non-admin', async () => {
    mockGetAuthUser.mockResolvedValue(NON_ADMIN_SESSION);

    const result = await adminListPackages();

    expect(result).toMatchObject({ status: 403 });
    expect(mockAdminListPackages).not.toHaveBeenCalled();
  });

  it('adminCreatePackage answers 401 signed out before validating the body', async () => {
    mockGetAuthUser.mockResolvedValue(SIGNED_OUT);

    const result = await adminCreatePackage({ name: '' });

    expect(result).toMatchObject({ status: 401 });
    expect(mockAdminCreatePackage).not.toHaveBeenCalled();
  });

  it('adminCreatePackage answers 403 for a signed-in non-admin', async () => {
    mockGetAuthUser.mockResolvedValue(NON_ADMIN_SESSION);

    const result = await adminCreatePackage({ name: '' });

    expect(result).toMatchObject({ status: 403 });
    expect(mockAdminCreatePackage).not.toHaveBeenCalled();
  });

  it('adminUpdatePackage answers 401 signed out before validating the body', async () => {
    mockGetAuthUser.mockResolvedValue(SIGNED_OUT);

    const result = await adminUpdatePackage('pkg-1', { name: '' });

    expect(result).toMatchObject({ status: 401 });
    expect(mockAdminUpdatePackage).not.toHaveBeenCalled();
  });

  it('adminUpdatePackage answers 403 for a signed-in non-admin', async () => {
    mockGetAuthUser.mockResolvedValue(NON_ADMIN_SESSION);

    const result = await adminUpdatePackage('pkg-1', { name: '' });

    expect(result).toMatchObject({ status: 403 });
    expect(mockAdminUpdatePackage).not.toHaveBeenCalled();
  });

  it('adminDeletePackage answers 401 signed out and never reaches the service', async () => {
    mockGetAuthUser.mockResolvedValue(SIGNED_OUT);

    const result = await adminDeletePackage('pkg-1');

    expect(result).toMatchObject({ status: 401 });
    expect(mockAdminDeletePackage).not.toHaveBeenCalled();
  });

  it('adminDeletePackage answers 403 for a signed-in non-admin', async () => {
    mockGetAuthUser.mockResolvedValue(NON_ADMIN_SESSION);

    const result = await adminDeletePackage('pkg-1');

    expect(result).toMatchObject({ status: 403 });
    expect(mockAdminDeletePackage).not.toHaveBeenCalled();
  });

  it('adminSaveSettings answers 401 signed out before validating the body', async () => {
    mockGetAuthUser.mockResolvedValue(SIGNED_OUT);

    const result = await adminSaveSettings({ booking_whatsapp_url: 'nope' });

    expect(result).toMatchObject({ status: 401 });
    expect(mockSaveSettings).not.toHaveBeenCalled();
  });

  it('adminSaveSettings answers 403 for a signed-in non-admin', async () => {
    mockGetAuthUser.mockResolvedValue(NON_ADMIN_SESSION);

    const result = await adminSaveSettings({ booking_whatsapp_url: 'nope' });

    expect(result).toMatchObject({ status: 403 });
    expect(mockSaveSettings).not.toHaveBeenCalled();
  });
});

describe('consultation admin success payloads and domain mapping', () => {
  it('adminListBookings returns the frozen payload and syncs the allowlist mirror', async () => {
    const result = await adminListBookings(2, 10, 'pending');

    expect(result.status).toBe(200);
    expect(bodyOf(result)).toEqual({ data: [BOOKING], total: 1 });
    expect(mockAdminListBookings).toHaveBeenCalledWith(2, 10, 'pending');
    expect(mockSyncAdminAllowlistMirror).toHaveBeenCalledWith(['admin@example.com']);
  });

  it('adminListBookings drops an unknown status filter', async () => {
    await adminListBookings(1, 20, 'archived');

    expect(mockAdminListBookings).toHaveBeenCalledWith(1, 20, undefined);
  });

  it('adminListBookings answers 500 with a failure body, not an empty-success shape', async () => {
    mockAdminListBookings.mockRejectedValue(new Error('db down'));

    const result = await adminListBookings(1, 20);

    expect(result).toMatchObject({
      status: 500,
      body: { success: false, error: 'تعذر تحميل الحجوزات.' },
    });
  });

  it('adminBookingAction confirms and returns the frozen payload', async () => {
    const result = await adminBookingAction('booking-1', { action: 'confirm' });

    expect(result).toMatchObject({ status: 200, body: { success: true } });
    expect(mockAdminConfirmBooking).toHaveBeenCalledWith('booking-1');
  });

  it('adminBookingAction rejects with a reason', async () => {
    await adminBookingAction('booking-1', { action: 'reject', rejected_reason: 'مزدحم' });

    expect(mockAdminRejectBooking).toHaveBeenCalledWith('booking-1', 'مزدحم');
  });

  it('adminBookingAction rejects an unknown action with 400 for an admin', async () => {
    const result = await adminBookingAction('booking-1', { action: 'nope' });

    expect(result).toMatchObject({ status: 400, body: { success: false } });
    expect(mockAdminConfirmBooking).not.toHaveBeenCalled();
  });

  it('adminBookingAction answers 500 on a genuine failure', async () => {
    mockAdminConfirmBooking.mockRejectedValue(new Error('db down'));

    const result = await adminBookingAction('booking-1', { action: 'confirm' });

    expect(result).toMatchObject({
      status: 500,
      body: { success: false, error: 'تعذر تنفيذ الإجراء على الحجز.' },
    });
  });

  it('adminListSlots returns the frozen payload for an admin', async () => {
    const result = await adminListSlots('2026-08-25T00:00:00.000Z');

    expect(result).toMatchObject({ status: 200, body: { slots: [SLOT] } });
    expect(mockAdminListSlots).toHaveBeenCalledWith('2026-08-25T00:00:00.000Z');
  });

  it('adminListSlots answers 500 with a failure body, not an empty-success shape', async () => {
    mockAdminListSlots.mockRejectedValue(new Error('db down'));

    const result = await adminListSlots();

    expect(result).toMatchObject({
      status: 500,
      body: { success: false, error: 'تعذر تحميل المواعيد.' },
    });
  });

  it('adminCreateSlot returns the frozen payload for an admin', async () => {
    const result = await adminCreateSlot(VALID_SLOT_BODY);

    expect(result).toMatchObject({ status: 200, body: { success: true, slot: SLOT } });
    expect(mockAdminCreateSlot).toHaveBeenCalledWith(VALID_SLOT_BODY);
  });

  it('adminCreateSlot rejects an invalid body with 400 for an admin', async () => {
    const result = await adminCreateSlot({ starts_at: 'nope', ends_at: 'nope' });

    expect(result).toMatchObject({
      status: 400,
      body: { success: false, error: 'توقيت الموعد غير صحيح.' },
    });
    expect(mockAdminCreateSlot).not.toHaveBeenCalled();
  });

  it('adminCreateSlot maps a validation error to 400', async () => {
    mockAdminCreateSlot.mockRejectedValue(new ConsultationValidationError('SLOT_RANGE_INVALID'));

    const result = await adminCreateSlot(VALID_SLOT_BODY);

    expect(result).toMatchObject({ status: 400, body: { success: false } });
  });

  it('adminCreateSlot maps a taken slot to 409', async () => {
    mockAdminCreateSlot.mockRejectedValue(new SlotTakenError('SLOT_TAKEN'));

    const result = await adminCreateSlot(VALID_SLOT_BODY);

    expect(result).toMatchObject({ status: 409, body: { success: false } });
  });

  it('adminCreateSlot answers 500 on a genuine failure', async () => {
    mockAdminCreateSlot.mockRejectedValue(new Error('db down'));

    const result = await adminCreateSlot(VALID_SLOT_BODY);

    expect(result).toMatchObject({
      status: 500,
      body: { success: false, error: 'تعذر إضافة الموعد.' },
    });
  });

  it('adminDeleteSlot returns the frozen payload for an admin', async () => {
    const result = await adminDeleteSlot('slot-1');

    expect(result).toMatchObject({ status: 200, body: { success: true } });
    expect(mockAdminDeleteSlot).toHaveBeenCalledWith('slot-1');
  });

  it('adminDeleteSlot maps a reserved slot to 409', async () => {
    mockAdminDeleteSlot.mockRejectedValue(new SlotReservedError('slot-1'));

    const result = await adminDeleteSlot('slot-1');

    expect(result).toMatchObject({ status: 409, body: { success: false } });
  });

  it('adminDeleteSlot answers 500 on a genuine failure', async () => {
    mockAdminDeleteSlot.mockRejectedValue(new Error('db down'));

    const result = await adminDeleteSlot('slot-1');

    expect(result).toMatchObject({
      status: 500,
      body: { success: false, error: 'تعذر حذف الموعد.' },
    });
  });

  it('adminListPackages returns the frozen payload for an admin', async () => {
    const result = await adminListPackages();

    expect(result).toMatchObject({ status: 200, body: { packages: [PACKAGE] } });
  });

  it('adminListPackages answers 500 with a failure body, not an empty-success shape', async () => {
    mockAdminListPackages.mockRejectedValue(new Error('db down'));

    const result = await adminListPackages();

    expect(result).toMatchObject({
      status: 500,
      body: { success: false, error: 'تعذر تحميل الباقات.' },
    });
  });

  it('adminCreatePackage returns the frozen payload with the packages cache tag', async () => {
    const result = await adminCreatePackage(VALID_PACKAGE_BODY);

    expect(result).toMatchObject({
      status: 200,
      body: { success: true, package: PACKAGE },
      tags: ['consultation-packages'],
    });
    expect(mockAdminCreatePackage).toHaveBeenCalledWith(VALID_PACKAGE_BODY);
  });

  it('adminCreatePackage rejects an invalid body with 400 for an admin', async () => {
    const result = await adminCreatePackage({ name: '' });

    expect(result).toMatchObject({
      status: 400,
      body: { success: false, error: 'بيانات الباقة غير مكتملة.' },
    });
    expect(mockAdminCreatePackage).not.toHaveBeenCalled();
  });

  it('adminCreatePackage answers 500 on a genuine failure', async () => {
    mockAdminCreatePackage.mockRejectedValue(new Error('db down'));

    const result = await adminCreatePackage(VALID_PACKAGE_BODY);

    expect(result).toMatchObject({
      status: 500,
      body: { success: false, error: 'تعذر إنشاء الباقة.' },
    });
  });

  it('adminUpdatePackage returns the frozen payload with the packages cache tag', async () => {
    const result = await adminUpdatePackage('pkg-1', VALID_PACKAGE_BODY);

    expect(result).toMatchObject({
      status: 200,
      body: { success: true, package: PACKAGE },
      tags: ['consultation-packages'],
    });
    expect(mockAdminUpdatePackage).toHaveBeenCalledWith('pkg-1', VALID_PACKAGE_BODY);
  });

  it('adminUpdatePackage rejects an invalid body with 400 for an admin', async () => {
    const result = await adminUpdatePackage('pkg-1', { name: '' });

    expect(result).toMatchObject({
      status: 400,
      body: { success: false, error: 'بيانات الباقة غير مكتملة.' },
    });
    expect(mockAdminUpdatePackage).not.toHaveBeenCalled();
  });

  it('adminUpdatePackage answers 500 on a genuine failure', async () => {
    mockAdminUpdatePackage.mockRejectedValue(new Error('db down'));

    const result = await adminUpdatePackage('pkg-1', VALID_PACKAGE_BODY);

    expect(result).toMatchObject({
      status: 500,
      body: { success: false, error: 'تعذر تحديث الباقة.' },
    });
  });

  it('adminDeletePackage returns the frozen payload with the packages cache tag', async () => {
    const result = await adminDeletePackage('pkg-1');

    expect(result).toMatchObject({
      status: 200,
      body: { success: true },
      tags: ['consultation-packages'],
    });
    expect(mockAdminDeletePackage).toHaveBeenCalledWith('pkg-1');
  });

  it('adminDeletePackage maps an in-use package to 409', async () => {
    mockAdminDeletePackage.mockRejectedValue(new PackageInUseError('pkg-1'));

    const result = await adminDeletePackage('pkg-1');

    expect(result).toMatchObject({ status: 409, body: { success: false } });
  });

  it('adminDeletePackage answers 500 on a genuine failure', async () => {
    mockAdminDeletePackage.mockRejectedValue(new Error('db down'));

    const result = await adminDeletePackage('pkg-1');

    expect(result).toMatchObject({
      status: 500,
      body: { success: false, error: 'تعذر حذف الباقة.' },
    });
  });

  it('adminSaveSettings returns the frozen payload with the settings cache tag', async () => {
    const result = await adminSaveSettings({ booking_whatsapp_url: 'https://wa.me/963968478904' });

    expect(result).toMatchObject({
      status: 200,
      body: { success: true },
      tags: ['consultation-settings'],
    });
    expect(mockSaveSettings).toHaveBeenCalledWith({
      booking_whatsapp_url: 'https://wa.me/963968478904',
    });
  });

  it('adminSaveSettings rejects an invalid body with 400 for an admin', async () => {
    const result = await adminSaveSettings({ booking_whatsapp_url: 'nope' });

    expect(result).toMatchObject({
      status: 400,
      body: { success: false, error: 'لا توجد قيم صالحة للحفظ.' },
    });
    expect(mockSaveSettings).not.toHaveBeenCalled();
  });

  it('adminSaveSettings answers 500 on a genuine failure', async () => {
    mockSaveSettings.mockRejectedValue(new Error('db down'));

    const result = await adminSaveSettings({ booking_whatsapp_url: 'https://wa.me/963968478904' });

    expect(result).toMatchObject({
      status: 500,
      body: { success: false, error: 'تعذر حفظ الإعدادات.' },
    });
  });
});

describe('consultation public endpoints stay public', () => {
  it('listConsultationPackages answers 200 without a session', async () => {
    const result = await listConsultationPackages();

    expect(result).toMatchObject({ status: 200, body: { packages: [PACKAGE] } });
  });

  it('getConsultationSettings answers 200 without a session', async () => {
    const result = await getConsultationSettings();

    expect(result).toMatchObject({
      status: 200,
      body: { settings: { booking_whatsapp_url: 'https://wa.me/963968478904' } },
    });
  });

  it('createBooking stays anonymous and never consults the admin adapter', async () => {
    const result = await createBooking(
      {
        full_name: 'أحمد العلي',
        phone_whatsapp: '+963 968 478 904',
        topic_description: 'أحتاج إلى استشارة حول بناء منتج رقمي جديد وإطلاقه في السوق.',
        package_id: '11111111-1111-4111-8111-111111111111',
        slot_ids: ['22222222-2222-4222-8222-222222222222'],
      },
      '1.1.1.1'
    );

    expect(result).toMatchObject({ status: 200, body: { success: true } });
    expect(mockGetAuthUser).not.toHaveBeenCalled();
  });
});
