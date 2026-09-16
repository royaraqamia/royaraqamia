import { describe, it, expect, vi } from 'vitest';
import {
  ConsultationService,
  ConsultationRateLimitError,
  ConsultationValidationError,
  SlotTakenError,
  PackageInUseError,
  SlotReservedError,
} from '@/backend/services/consultation/consultation-service';
import type { ConsultationRepositories } from '@/backend/repositories/consultation';

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
      create: vi.fn(),
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

function makeService(
  repositories: ConsultationRepositories,
  overrides: {
    checkRateLimit?: (key: string, limit: number, windowMs: number) => Promise<boolean>;
    generateReferenceCode?: () => string;
  } = {}
) {
  return new ConsultationService(repositories, {
    nowIso: () => NOW,
    checkRateLimit: overrides.checkRateLimit ?? vi.fn().mockResolvedValue(true),
    generateReferenceCode: overrides.generateReferenceCode ?? vi.fn().mockReturnValue(REFERENCE),
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
});
