import { describe, it, expect, vi } from 'vitest';
import {
  ConsultationService,
  ConsultationRateLimitError,
  ConsultationValidationError,
  ConsultationBookingNotFoundError,
  ConsultationBookingNotReschedulableError,
  SlotTakenError,
  PackageInUseError,
  SlotReservedError,
  type ConsultationBookingNotification,
} from '@/backend/services/consultation/consultation-service';
import type { ConsultationRepositories } from '@/backend/repositories/consultation';
import { createNotificationFanout } from '@/backend/config/notifications';
import { createConsultationBookingNotifier } from '@/backend/config/consultation';

const NOW = '2026-08-25T10:00:00.000Z';
const REFERENCE = 'CONS-2026-ABCDEFGH';

function makeRepositories(overrides: Partial<ConsultationRepositories> = {}) {
  const repositories = {
    packages: {
      listActive: vi.fn(),
      listAll: vi.fn(),
      getById: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
    },
    slots: {
      listAvailable: vi.fn(),
      listFrom: vi.fn(),
      create: vi.fn(),
      remove: vi.fn(),
    },
    bookings: {
      listForAdmin: vi.fn(),
      listByUser: vi.fn(),
      create: vi.fn(),
      confirm: vi.fn(),
      reject: vi.fn(),
      updateContactOwned: vi.fn(),
      reschedule: vi.fn(),
    },
    settings: {
      read: vi.fn(),
      upsert: vi.fn(),
    },
    ...overrides,
  } as unknown as ConsultationRepositories;
  return repositories;
}

function makeService(
  repositories: ConsultationRepositories,
  overrides: {
    checkRateLimit?: (key: string, limit: number, windowMs: number) => Promise<boolean>;
    generateReferenceCode?: () => string;
    notifyAdmins?: (booking: ConsultationBookingNotification) => void;
  } = {}
) {
  return new ConsultationService(repositories, {
    nowIso: () => NOW,
    checkRateLimit: overrides.checkRateLimit ?? vi.fn().mockResolvedValue(true),
    generateReferenceCode: overrides.generateReferenceCode ?? vi.fn().mockReturnValue(REFERENCE),
    notifyAdmins: vi.fn(overrides.notifyAdmins),
    captureException: vi.fn(),
  });
}

const bookingInput = {
  package_id: 'pkg-1',
  slot_ids: ['slot-1'],
  full_name: 'أحمد محمد',
  phone_whatsapp: '+963968478904',
  topic_description: 'أرغب باستشارة حول بناء تطبيق ويب كامل',
};

const context = { ip: '1.2.3.4', userId: null };

describe('ConsultationService', () => {
  describe('createBooking', () => {
    it('rejects when selected slot count does not match the package sessions_count', async () => {
      const repositories = makeRepositories();
      (repositories.packages.getById as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'pkg-1',
        is_active: true,
        sessions_count: 2,
      });
      const service = makeService(repositories);

      await expect(
        service.createBooking({ ...bookingInput, slot_ids: ['a', 'b', 'c'] }, context)
      ).rejects.toBeInstanceOf(ConsultationValidationError);
      expect(repositories.bookings.create).not.toHaveBeenCalled();
    });

    it('rejects inactive or missing packages before touching bookings', async () => {
      const repositories = makeRepositories();
      (repositories.packages.getById as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      const service = makeService(repositories);

      await expect(service.createBooking(bookingInput, context)).rejects.toBeInstanceOf(
        ConsultationValidationError
      );
      expect(repositories.bookings.create).not.toHaveBeenCalled();
    });

    it('refuses to book once the per-IP rate limit is exhausted', async () => {
      const repositories = makeRepositories();
      (repositories.packages.getById as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'pkg-1',
        is_active: true,
        sessions_count: 1,
      });
      const checkRateLimit = vi.fn().mockResolvedValue(false);
      const service = makeService(repositories, { checkRateLimit });

      await expect(service.createBooking(bookingInput, context)).rejects.toBeInstanceOf(
        ConsultationRateLimitError
      );
      expect(checkRateLimit).toHaveBeenCalledWith('consultation-booking:1.2.3.4', 5, 600_000);
      expect(repositories.bookings.create).not.toHaveBeenCalled();
    });

    it('creates an anonymous booking with a generated reference code', async () => {
      const repositories = makeRepositories();
      (repositories.packages.getById as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'pkg-1',
        is_active: true,
        sessions_count: 1,
      });
      (repositories.bookings.create as ReturnType<typeof vi.fn>).mockResolvedValue('booking-9');
      const service = makeService(repositories);

      await expect(service.createBooking(bookingInput, context)).resolves.toEqual({
        id: 'booking-9',
        referenceCode: REFERENCE,
      });
      expect(repositories.bookings.create).toHaveBeenCalledWith({
        ...bookingInput,
        userId: null,
        referenceCode: REFERENCE,
        email: null,
      });
    });

    it('attributes a signed-in visitor opportunistically', async () => {
      const repositories = makeRepositories();
      (repositories.packages.getById as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'pkg-1',
        is_active: true,
        sessions_count: 1,
      });
      (repositories.bookings.create as ReturnType<typeof vi.fn>).mockResolvedValue('booking-9');
      const service = makeService(repositories);

      await service.createBooking(bookingInput, { ip: '1.2.3.4', userId: 'user-1' });

      expect(repositories.bookings.create).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user-1' })
      );
    });

    it('retries with a fresh reference code when the column collides', async () => {
      const repositories = makeRepositories();
      (repositories.packages.getById as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'pkg-1',
        is_active: true,
        sessions_count: 1,
      });
      (repositories.bookings.create as ReturnType<typeof vi.fn>)
        .mockRejectedValueOnce(new Error('REFERENCE_TAKEN'))
        .mockResolvedValueOnce('booking-9');
      const generateReferenceCode = vi
        .fn()
        .mockReturnValueOnce('CONS-2026-AAAAAAAA')
        .mockReturnValueOnce('CONS-2026-BBBBBBBB');
      const service = makeService(repositories, { generateReferenceCode });

      await expect(service.createBooking(bookingInput, context)).resolves.toEqual({
        id: 'booking-9',
        referenceCode: 'CONS-2026-BBBBBBBB',
      });
      expect(repositories.bookings.create).toHaveBeenCalledTimes(2);
    });

    it('gives up after five collisions with REFERENCE_CODE_EXHAUSTED', async () => {
      const repositories = makeRepositories();
      (repositories.packages.getById as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'pkg-1',
        is_active: true,
        sessions_count: 1,
      });
      (repositories.bookings.create as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('REFERENCE_TAKEN')
      );
      const service = makeService(repositories);

      await expect(service.createBooking(bookingInput, context)).rejects.toThrow(
        'REFERENCE_CODE_EXHAUSTED'
      );
      expect(repositories.bookings.create).toHaveBeenCalledTimes(5);
    });

    it('maps SLOT_TAKEN races to SlotTakenError', async () => {
      const repositories = makeRepositories();
      (repositories.packages.getById as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'pkg-1',
        is_active: true,
        sessions_count: 1,
      });
      (repositories.bookings.create as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('SLOT_TAKEN')
      );
      const service = makeService(repositories);

      await expect(service.createBooking(bookingInput, context)).rejects.toBeInstanceOf(
        SlotTakenError
      );
    });

    it('maps SLOT_UNAVAILABLE to ConsultationValidationError', async () => {
      const repositories = makeRepositories();
      (repositories.packages.getById as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'pkg-1',
        is_active: true,
        sessions_count: 1,
      });
      (repositories.bookings.create as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('SLOT_UNAVAILABLE')
      );
      const service = makeService(repositories);

      await expect(service.createBooking(bookingInput, context)).rejects.toBeInstanceOf(
        ConsultationValidationError
      );
    });

    it('notifies admins after the booking is committed', async () => {
      const repositories = makeRepositories();
      (repositories.packages.getById as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'pkg-1',
        name: 'باقة الاستشارة الكاملة',
        is_active: true,
        sessions_count: 1,
      });
      (repositories.bookings.create as ReturnType<typeof vi.fn>).mockResolvedValue('booking-9');
      const notifyAdmins = vi.fn();
      const service = makeService(repositories, { notifyAdmins });

      await service.createBooking(bookingInput, context);

      expect(notifyAdmins).toHaveBeenCalledTimes(1);
      expect(notifyAdmins).toHaveBeenCalledWith({
        id: 'booking-9',
        referenceCode: REFERENCE,
        fullName: bookingInput.full_name,
        packageName: 'باقة الاستشارة الكاملة',
      });
    });

    it('still returns the booking when the admin notification throws', async () => {
      const repositories = makeRepositories();
      (repositories.packages.getById as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'pkg-1',
        name: 'باقة',
        is_active: true,
        sessions_count: 1,
      });
      (repositories.bookings.create as ReturnType<typeof vi.fn>).mockResolvedValue('booking-9');
      const service = makeService(repositories, {
        notifyAdmins: () => {
          throw new Error('push service down');
        },
      });

      await expect(service.createBooking(bookingInput, context)).resolves.toEqual({
        id: 'booking-9',
        referenceCode: REFERENCE,
      });
    });

    it('still returns the booking when the fan-out delivery fails', async () => {
      const repositories = makeRepositories();
      (repositories.packages.getById as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'pkg-1',
        name: 'باقة',
        is_active: true,
        sessions_count: 1,
      });
      (repositories.bookings.create as ReturnType<typeof vi.fn>).mockResolvedValue('booking-9');
      const broadcast = vi.fn(async () => {
        throw new Error('notifications down');
      });
      const service = makeService(repositories, {
        notifyAdmins: createConsultationBookingNotifier(
          createNotificationFanout({
            deliver: { broadcast },
            push: { sendToUsers: async () => undefined },
            resolveAdminIds: async () => ['admin-1'],
            schedule: (task) => {
              void task();
            },
          })
        ),
      });

      await expect(service.createBooking(bookingInput, context)).resolves.toEqual({
        id: 'booking-9',
        referenceCode: REFERENCE,
      });
      await vi.waitFor(() => expect(broadcast).toHaveBeenCalledTimes(1));
    });

    it('does not notify admins when the booking fails', async () => {
      const repositories = makeRepositories();
      (repositories.packages.getById as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'pkg-1',
        name: 'باقة',
        is_active: true,
        sessions_count: 1,
      });
      (repositories.bookings.create as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('SLOT_TAKEN')
      );
      const notifyAdmins = vi.fn();
      const service = makeService(repositories, { notifyAdmins });

      await expect(service.createBooking(bookingInput, context)).rejects.toBeInstanceOf(
        SlotTakenError
      );
      expect(notifyAdmins).not.toHaveBeenCalled();
    });
  });

  describe('getAvailableSlots', () => {
    it('lists available slots from the repository at the configured instant', async () => {
      const repositories = makeRepositories();
      (repositories.slots.listAvailable as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      const service = makeService(repositories);

      await service.getAvailableSlots();

      expect(repositories.slots.listAvailable).toHaveBeenCalledWith(NOW);
    });
  });

  describe('admin actions', () => {
    it('confirms and rejects delegate to the bookings repository', async () => {
      const repositories = makeRepositories();
      const service = makeService(repositories);

      await service.adminConfirmBooking('b-1');
      expect(repositories.bookings.confirm).toHaveBeenCalledWith('b-1');

      await service.adminRejectBooking('b-2', 'الموعد لم يعد مناسبًا');
      expect(repositories.bookings.reject).toHaveBeenCalledWith('b-2', 'الموعد لم يعد مناسبًا');
    });

    it('surfaces trigger-blocked slot deletions as SlotReservedError', async () => {
      const repositories = makeRepositories();
      (repositories.slots.remove as ReturnType<typeof vi.fn>).mockRejectedValue({
        message: 'SLOT_HAS_ACTIVE_BOOKING',
      });
      const service = makeService(repositories);

      await expect(service.adminDeleteSlot('slot-1')).rejects.toBeInstanceOf(SlotReservedError);
    });

    it('validates slot range before creating', async () => {
      const repositories = makeRepositories();
      const service = makeService(repositories);

      await expect(
        service.adminCreateSlot({ starts_at: NOW, ends_at: '2026-08-25T09:00:00.000Z' })
      ).rejects.toBeInstanceOf(ConsultationValidationError);
      expect(repositories.slots.create).not.toHaveBeenCalled();
    });

    it('maps FK violations on package deletion to PackageInUseError', async () => {
      const repositories = makeRepositories();
      (repositories.packages.remove as ReturnType<typeof vi.fn>).mockRejectedValue({
        code: '23503',
        message: 'foreign key violation',
      });
      const service = makeService(repositories);

      await expect(service.adminDeletePackage('pkg-1')).rejects.toBeInstanceOf(PackageInUseError);
    });
  });

  describe('owner edits', () => {
    const ownedBooking = {
      id: 'booking-9',
      reference_code: REFERENCE,
      user_id: 'user-1',
      full_name: 'أحمد محمد',
      package_name: 'باقة',
      status: 'pending',
    };

    it('lists only the signed-in booker\u2019s bookings', async () => {
      const repositories = makeRepositories();
      (repositories.bookings.listByUser as ReturnType<typeof vi.fn>).mockResolvedValue([
        ownedBooking,
      ]);
      const service = makeService(repositories);

      const rows = await service.listMyBookings('user-1');

      expect(repositories.bookings.listByUser).toHaveBeenCalledWith('user-1');
      expect(rows).toHaveLength(1);
    });

    it('refuses an edit to a booking the visitor does not own', async () => {
      const repositories = makeRepositories();
      (repositories.bookings.listByUser as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      const service = makeService(repositories);

      await expect(
        service.updateMyBooking('user-1', 'booking-9', {
          full_name: 'أحمد',
          phone_whatsapp: '+963968478904',
          topic_description: 'موضوع الاستشارة محدَّث بما يكفي من الحروف.',
        })
      ).rejects.toBeInstanceOf(ConsultationBookingNotFoundError);
      expect(repositories.bookings.updateContactOwned).not.toHaveBeenCalled();
    });

    it('rewrites the contact text without rescheduling when no package/slots are sent', async () => {
      const repositories = makeRepositories();
      (repositories.bookings.listByUser as ReturnType<typeof vi.fn>).mockResolvedValue([
        ownedBooking,
      ]);
      (repositories.bookings.updateContactOwned as ReturnType<typeof vi.fn>).mockResolvedValue(
        ownedBooking
      );
      const service = makeService(repositories);

      await service.updateMyBooking('user-1', 'booking-9', {
        full_name: 'أحمد محمد',
        phone_whatsapp: '+963968478904',
        topic_description: 'موضوع الاستشارة محدَّث بما يكفي من الحروف.',
      });

      expect(repositories.bookings.reschedule).not.toHaveBeenCalled();
      expect(repositories.bookings.updateContactOwned).toHaveBeenCalledWith(
        'booking-9',
        'user-1',
        expect.objectContaining({ topic_description: 'موضوع الاستشارة محدَّث بما يكفي من الحروف.' })
      );
    });

    it('reschedules atomically when the package and slots are sent', async () => {
      const repositories = makeRepositories();
      (repositories.bookings.listByUser as ReturnType<typeof vi.fn>).mockResolvedValue([
        ownedBooking,
      ]);
      (repositories.bookings.updateContactOwned as ReturnType<typeof vi.fn>).mockResolvedValue(
        ownedBooking
      );
      const service = makeService(repositories);

      await service.updateMyBooking('user-1', 'booking-9', {
        full_name: 'أحمد محمد',
        phone_whatsapp: '+963968478904',
        topic_description: 'موضوع الاستشارة محدَّث بما يكفي من الحروف.',
        package_id: 'pkg-2',
        slot_ids: ['slot-3'],
      });

      expect(repositories.bookings.reschedule).toHaveBeenCalledWith(
        'booking-9',
        'user-1',
        'pkg-2',
        ['slot-3']
      );
    });

    it('maps a SLOT_TAKEN reschedule to SlotTakenError', async () => {
      const repositories = makeRepositories();
      (repositories.bookings.listByUser as ReturnType<typeof vi.fn>).mockResolvedValue([
        ownedBooking,
      ]);
      (repositories.bookings.reschedule as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('SLOT_TAKEN')
      );
      const service = makeService(repositories);

      await expect(
        service.updateMyBooking('user-1', 'booking-9', {
          full_name: 'أحمد محمد',
          phone_whatsapp: '+963968478904',
          topic_description: 'موضوع الاستشارة محدَّث بما يكفي من الحروف.',
          package_id: 'pkg-2',
          slot_ids: ['slot-3'],
        })
      ).rejects.toBeInstanceOf(SlotTakenError);
      expect(repositories.bookings.updateContactOwned).not.toHaveBeenCalled();
    });

    it('maps BOOKING_NOT_RESCHEDULABLE to its typed error', async () => {
      const repositories = makeRepositories();
      (repositories.bookings.listByUser as ReturnType<typeof vi.fn>).mockResolvedValue([
        ownedBooking,
      ]);
      (repositories.bookings.reschedule as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('BOOKING_NOT_RESCHEDULABLE')
      );
      const service = makeService(repositories);

      await expect(
        service.updateMyBooking('user-1', 'booking-9', {
          full_name: 'أحمد محمد',
          phone_whatsapp: '+963968478904',
          topic_description: 'موضوع الاستشارة محدَّث بما يكفي من الحروف.',
          package_id: 'pkg-2',
          slot_ids: ['slot-3'],
        })
      ).rejects.toBeInstanceOf(ConsultationBookingNotReschedulableError);
    });

    it('refuses an edit past the per-booker limit without writing anything', async () => {
      const repositories = makeRepositories();
      const checkRateLimit = vi.fn().mockResolvedValue(false);
      const service = makeService(repositories, { checkRateLimit });

      await expect(
        service.updateMyBooking('user-1', 'booking-9', {
          full_name: 'أحمد محمد',
          phone_whatsapp: '+963968478904',
          topic_description: 'موضوع الاستشارة محدَّث بما يكفي من الحروف.',
        })
      ).rejects.toBeInstanceOf(ConsultationRateLimitError);
      expect(repositories.bookings.listByUser).not.toHaveBeenCalled();
    });
  });
});
