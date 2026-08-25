import { describe, it, expect, vi } from 'vitest';
import {
  ConsultationService,
  ConsultationValidationError,
  SlotTakenError,
  BookingStateError,
  PackageInUseError,
  SlotReservedError,
} from '@/backend/services/consultation/consultation-service';
import type { ConsultationRepositories } from '@/backend/repositories/consultation';
import type { CreateBookingInput } from '@/shared/contracts/consultation';

const NOW = '2026-08-25T10:00:00.000Z';

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
      listByUser: vi.fn(),
      listForAdmin: vi.fn(),
      create: vi.fn(),
      markReceiptSent: vi.fn(),
      cancelByUser: vi.fn(),
      expireStale: vi.fn(),
      confirm: vi.fn(),
      reject: vi.fn(),
    },
    settings: {
      read: vi.fn(),
      upsert: vi.fn(),
    },
    ...overrides,
  } as unknown as ConsultationRepositories;
  return repositories;
}

function makeService(repositories: ConsultationRepositories) {
  return new ConsultationService(repositories, { nowIso: () => NOW });
}

const singleSessionInput: CreateBookingInput = {
  package_id: 'pkg-1',
  slot_ids: ['slot-1'],
  full_name: 'أحمد محمد',
  phone_whatsapp: '+963968478904',
  email: 'ahmed@example.com',
  topic_description: 'أرغب باستشارة حول بناء تطبيق ويب كامل',
  region: 'syria',
  payment_method: 'shamcash',
};

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
        service.createBooking('user-1', { ...singleSessionInput, slot_ids: ['a', 'b', 'c'] })
      ).rejects.toBeInstanceOf(ConsultationValidationError);
      expect(repositories.bookings.create).not.toHaveBeenCalled();
    });

    it('rejects inactive or missing packages before touching bookings', async () => {
      const repositories = makeRepositories();
      (repositories.packages.getById as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      const service = makeService(repositories);

      await expect(service.createBooking('user-1', singleSessionInput)).rejects.toBeInstanceOf(
        ConsultationValidationError
      );
      expect(repositories.bookings.create).not.toHaveBeenCalled();
    });

    it('delegates a valid command with the userId attached and returns the booking id', async () => {
      const repositories = makeRepositories();
      (repositories.packages.getById as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'pkg-1',
        is_active: true,
        sessions_count: 1,
      });
      (repositories.bookings.create as ReturnType<typeof vi.fn>).mockResolvedValue('booking-9');
      const service = makeService(repositories);

      await expect(service.createBooking('user-1', singleSessionInput)).resolves.toBe('booking-9');
      expect(repositories.bookings.create).toHaveBeenCalledWith({
        ...singleSessionInput,
        userId: 'user-1',
      });
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

      await expect(service.createBooking('user-1', singleSessionInput)).rejects.toBeInstanceOf(
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

      await expect(service.createBooking('user-1', singleSessionInput)).rejects.toBeInstanceOf(
        ConsultationValidationError
      );
    });
  });

  describe('getAvailableSlots (expiry sweep)', () => {
    it('runs the stale-pending sweep BEFORE listing available slots', async () => {
      const repositories = makeRepositories();
      const order: string[] = [];
      (repositories.bookings.expireStale as ReturnType<typeof vi.fn>).mockImplementation(
        () => (order.push('expire'), Promise.resolve(0))
      );
      (repositories.slots.listAvailable as ReturnType<typeof vi.fn>).mockImplementation(
        () => (order.push('list'), Promise.resolve([]))
      );
      const service = makeService(repositories);

      await service.getAvailableSlots();

      expect(order).toEqual(['expire', 'list']);
      expect(repositories.slots.listAvailable).toHaveBeenCalledWith(NOW);
    });

    it('propagates sweep failures so callers cannot see half-freed availability', async () => {
      const repositories = makeRepositories();
      (repositories.bookings.expireStale as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('boom')
      );
      const service = makeService(repositories);

      await expect(service.getAvailableSlots()).rejects.toThrow('boom');
      expect(repositories.slots.listAvailable).not.toHaveBeenCalled();
    });
  });

  describe('getMyBookings', () => {
    it('returns bookings even when the opportunistic sweep fails', async () => {
      const repositories = makeRepositories();
      (repositories.bookings.listByUser as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      (repositories.bookings.expireStale as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('boom')
      );
      const service = makeService(repositories);

      await expect(service.getMyBookings('user-1')).resolves.toEqual([]);
    });
  });

  describe('receipt / cancel transitions', () => {
    it('maps BOOKING_NOT_PENDING to BookingStateError on receipt-sent', async () => {
      const repositories = makeRepositories();
      (repositories.bookings.markReceiptSent as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('BOOKING_NOT_PENDING')
      );
      const service = makeService(repositories);

      await expect(service.markReceiptSent('user-1', 'b-1')).rejects.toBeInstanceOf(
        BookingStateError
      );
    });

    it('maps BOOKING_NOT_CANCELLABLE to BookingStateError on cancel', async () => {
      const repositories = makeRepositories();
      (repositories.bookings.cancelByUser as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('BOOKING_NOT_CANCELLABLE')
      );
      const service = makeService(repositories);

      await expect(service.cancelBooking('user-1', 'b-1')).rejects.toBeInstanceOf(
        BookingStateError
      );
    });

    it('delegates markReceiptSent with the owning userId', async () => {
      const repositories = makeRepositories();
      (repositories.bookings.markReceiptSent as ReturnType<typeof vi.fn>).mockResolvedValue(
        undefined
      );
      const service = makeService(repositories);

      await expect(service.markReceiptSent('user-1', 'b-1')).resolves.toBeUndefined();
      expect(repositories.bookings.markReceiptSent).toHaveBeenCalledWith('user-1', 'b-1');
    });
  });

  describe('admin actions', () => {
    it('confirms and rejects delegate to the bookings repository', async () => {
      const repositories = makeRepositories();
      const service = makeService(repositories);

      await service.adminConfirmBooking('b-1');
      expect(repositories.bookings.confirm).toHaveBeenCalledWith('b-1');

      await service.adminRejectBooking('b-2', 'الإيصال غير مطابق');
      expect(repositories.bookings.reject).toHaveBeenCalledWith('b-2', 'الإيصال غير مطابق');
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
});
