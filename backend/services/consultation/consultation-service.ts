import type {
  AvailabilitySlot,
  ConsultationBooking,
  ConsultationBookingStatus,
  ConsultationPackage,
  ConsultationSettings,
  PackageUpsertInput,
  SlotCreateInput,
} from '@/shared/contracts/consultation';
import type {
  AdminAvailabilitySlot,
  BookingListResult,
  ConsultationRepositories,
  CreateBookingCommand,
} from '@/backend/repositories/consultation';

export class ConsultationValidationError extends Error {}
export class SlotTakenError extends Error {}
export class BookingStateError extends Error {}
export class PackageInUseError extends Error {}
export class SlotReservedError extends Error {}

const RPC_VALIDATION_CODES = new Set([
  'PACKAGE_NOT_FOUND',
  'SLOT_COUNT_MISMATCH',
  'SLOT_UNAVAILABLE',
]);

function isForeignKeyViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === '23503'
  );
}

export interface ConsultationServiceConfig {
  nowIso: () => string;
}

/**
 * `adminRepositories` (service-role) is optional and used ONLY for the
 * expiry sweep, whose RPC is executable by service_role alone. When the
 * primary bundle already runs on the admin client it can be omitted.
 */
export class ConsultationService {
  constructor(
    private readonly repositories: ConsultationRepositories,
    private readonly config: ConsultationServiceConfig = { nowIso: () => new Date().toISOString() },
    private readonly adminRepositories?: ConsultationRepositories
  ) {}

  private sweepStalePendings(): Promise<number> {
    return (this.adminRepositories ?? this.repositories).bookings.expireStale();
  }

  // ----------------------------------------------------------
  // Public (authenticated booker)
  // ----------------------------------------------------------

  async getActivePackages(): Promise<ConsultationPackage[]> {
    return this.repositories.packages.listActive();
  }

  /** Always sweeps stale pendings first so freed slots reappear immediately. */
  async getAvailableSlots(): Promise<AvailabilitySlot[]> {
    await this.sweepStalePendings();
    return this.repositories.slots.listAvailable(this.config.nowIso());
  }

  async createBooking(
    userId: string,
    input: Omit<CreateBookingCommand, 'userId'>
  ): Promise<string> {
    const pkg = await this.repositories.packages.getById(input.package_id);
    if (!pkg || !pkg.is_active) {
      throw new ConsultationValidationError('PACKAGE_NOT_FOUND');
    }
    if (input.slot_ids.length !== pkg.sessions_count) {
      throw new ConsultationValidationError('SLOT_COUNT_MISMATCH');
    }

    try {
      return await this.repositories.bookings.create({ ...input, userId });
    } catch (error) {
      throw this.mapBookingError(error);
    }
  }

  async getMyBookings(userId: string): Promise<ConsultationBooking[]> {
    const bookings = await this.repositories.bookings.listByUser(userId);
    // Self-heal the viewer's own stale pendings before rendering countdowns.
    await this.sweepStalePendings().catch(() => undefined);
    return bookings;
  }

  async markReceiptSent(userId: string, bookingId: string): Promise<void> {
    try {
      await this.repositories.bookings.markReceiptSent(userId, bookingId);
    } catch (error) {
      throw this.mapBookingError(error);
    }
  }

  async cancelBooking(userId: string, bookingId: string): Promise<void> {
    try {
      await this.repositories.bookings.cancelByUser(userId, bookingId);
    } catch (error) {
      throw this.mapBookingError(error);
    }
  }

  // ----------------------------------------------------------
  // Admin
  // ----------------------------------------------------------

  async adminListBookings(
    page: number,
    pageSize: number,
    status?: ConsultationBookingStatus
  ): Promise<BookingListResult> {
    return this.repositories.bookings.listForAdmin(page, pageSize, status);
  }

  async adminConfirmBooking(bookingId: string): Promise<void> {
    await this.repositories.bookings.confirm(bookingId);
  }

  async adminRejectBooking(bookingId: string, reason?: string): Promise<void> {
    await this.repositories.bookings.reject(bookingId, reason);
  }

  async adminListSlots(fromIso?: string): Promise<AdminAvailabilitySlot[]> {
    return this.repositories.slots.listFrom(fromIso ?? this.config.nowIso());
  }

  async adminCreateSlot(input: SlotCreateInput): Promise<AvailabilitySlot> {
    if (new Date(input.ends_at).getTime() <= new Date(input.starts_at).getTime()) {
      throw new ConsultationValidationError('SLOT_RANGE_INVALID');
    }
    return this.repositories.slots.create(input);
  }

  async adminDeleteSlot(slotId: string): Promise<void> {
    try {
      await this.repositories.slots.remove(slotId);
    } catch (error) {
      const message =
        typeof error === 'object' && error !== null && 'message' in error
          ? String((error as { message?: string }).message)
          : '';
      if (message.includes('SLOT_HAS_ACTIVE_BOOKING')) {
        throw new SlotReservedError(slotId);
      }
      throw error;
    }
  }

  async adminListPackages(): Promise<ConsultationPackage[]> {
    return this.repositories.packages.listAll();
  }

  async adminCreatePackage(input: PackageUpsertInput): Promise<ConsultationPackage> {
    return this.repositories.packages.create(input);
  }

  async adminUpdatePackage(id: string, input: PackageUpsertInput): Promise<ConsultationPackage> {
    return this.repositories.packages.update(id, input);
  }

  async adminDeletePackage(id: string): Promise<void> {
    try {
      await this.repositories.packages.remove(id);
    } catch (error) {
      if (isForeignKeyViolation(error)) {
        throw new PackageInUseError(id);
      }
      throw error;
    }
  }

  async getSettings(): Promise<Partial<ConsultationSettings>> {
    return this.repositories.settings.read();
  }

  async saveSettings(entries: Partial<ConsultationSettings>): Promise<void> {
    await this.repositories.settings.upsert(entries);
  }

  // ----------------------------------------------------------

  private mapBookingError(error: unknown): Error {
    const code =
      error instanceof Error
        ? error.message.trim()
        : typeof error === 'object' &&
            error !== null &&
            'message' in error &&
            typeof (error as { message?: unknown }).message === 'string'
          ? String((error as { message: string }).message).trim()
          : '';

    if (code === 'SLOT_TAKEN') return new SlotTakenError(code);
    if (RPC_VALIDATION_CODES.has(code)) return new ConsultationValidationError(code);
    if (
      code === 'BOOKING_NOT_PENDING' ||
      code === 'BOOKING_NOT_CANCELLABLE' ||
      code === 'NOT_AUTHENTICATED'
    ) {
      return new BookingStateError(code);
    }
    return error instanceof Error ? error : new Error('UNKNOWN');
  }
}
