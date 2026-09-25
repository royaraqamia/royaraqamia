import { randomInt } from 'crypto';
import type {
  AvailabilitySlot,
  ConsultationBookingStatus,
  ConsultationPackage,
  ConsultationSettings,
  CreateBookingInput,
  PackageUpsertInput,
  SlotCreateInput,
} from '@/shared/contracts/consultation';
import type {
  AdminAvailabilitySlot,
  BookingListResult,
  ConsultationRepositories,
  CreateBookingCommand,
} from '@/backend/repositories/consultation';
import { mintReferenceCode, mintWithUniqueCode } from '@/shared/reference-code';

export class ConsultationValidationError extends Error {}
export class SlotTakenError extends Error {}
export class PackageInUseError extends Error {}
export class SlotReservedError extends Error {}

export class ConsultationRateLimitError extends Error {
  constructor() {
    super('تم تجاوز الحد المسموح من الطلبات. الرجاء المحاولة بعد قليل.');
    this.name = 'ConsultationRateLimitError';
  }
}

const RPC_VALIDATION_CODES = new Set([
  'PACKAGE_NOT_FOUND',
  'SLOT_COUNT_MISMATCH',
  'SLOT_UNAVAILABLE',
]);

// 5 bookings per 10 minutes per IP. Deliberately fail-open: an anonymous
// booking form must keep accepting requests when the limiter is unreachable.
const IP_LIMIT = 5;
const WINDOW_MS = 10 * 60_000;

const CONSULTATION_REFERENCE_CODE_PREFIX = 'CONS';
const MAX_REFERENCE_CODE_ATTEMPTS = 5;

export function generateConsultationReferenceCode(): string {
  return mintReferenceCode(CONSULTATION_REFERENCE_CODE_PREFIX, (maxExclusive) =>
    randomInt(maxExclusive)
  );
}

function isForeignKeyViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === '23503'
  );
}

function errorCode(error: unknown): string {
  if (error instanceof Error) return error.message.trim();
  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as { message?: unknown }).message === 'string'
  ) {
    return String((error as { message: string }).message).trim();
  }
  return '';
}

export interface ConsultationServiceConfig {
  nowIso: () => string;
  checkRateLimit: (key: string, limit: number, windowMs: number) => Promise<boolean>;
  generateReferenceCode: () => string;
  /** Fail-safe: called after the booking is committed, never allowed to throw upstream. */
  notifyAdmins?: ConsultationBookingNotifier;
  captureException?: (error: unknown, options?: { extra?: Record<string, unknown> }) => void;
}

export interface CreateBookingContext {
  ip: string;
  /** Present when a signed-in visitor books; bookings never require auth. */
  userId: string | null;
}

export interface CreatedBooking {
  id: string;
  referenceCode: string;
}

/** The subset of a booking an admin notification needs, resolved at creation time. */
export interface ConsultationBookingNotification {
  id: string;
  referenceCode: string;
  fullName: string;
  packageName: string | null;
}

export interface ConsultationBookingNotifier {
  (booking: ConsultationBookingNotification): void;
}

/**
 * Bookings are anonymous and unpaid: a request holds its slots while an
 * operator reviews it. Rejecting or cancelling frees them via the DB trigger.
 */
export class ConsultationService {
  constructor(
    private readonly repositories: ConsultationRepositories,
    private readonly config: ConsultationServiceConfig
  ) {}

  // ----------------------------------------------------------
  // Public
  // ----------------------------------------------------------

  async getActivePackages(): Promise<ConsultationPackage[]> {
    return this.repositories.packages.listActive();
  }

  async getAvailableSlots(): Promise<AvailabilitySlot[]> {
    return this.repositories.slots.listAvailable(this.config.nowIso());
  }

  async getSettings(): Promise<Partial<ConsultationSettings>> {
    return this.repositories.settings.read();
  }

  async createBooking(
    input: CreateBookingInput,
    context: CreateBookingContext
  ): Promise<CreatedBooking> {
    const allowed = await this.config.checkRateLimit(
      `consultation-booking:${context.ip}`,
      IP_LIMIT,
      WINDOW_MS
    );
    if (!allowed) throw new ConsultationRateLimitError();

    const pkg = await this.repositories.packages.getById(input.package_id);
    if (!pkg || !pkg.is_active) {
      throw new ConsultationValidationError('PACKAGE_NOT_FOUND');
    }
    if (input.slot_ids.length !== pkg.sessions_count) {
      throw new ConsultationValidationError('SLOT_COUNT_MISMATCH');
    }

    const command: Omit<CreateBookingCommand, 'referenceCode'> = {
      ...input,
      userId: context.userId,
      email: null,
    };

    const { code: referenceCode, result: id } = await mintWithUniqueCode({
      attempts: MAX_REFERENCE_CODE_ATTEMPTS,
      mint: () => this.config.generateReferenceCode(),
      isCollision: (error) => errorCode(error) === 'REFERENCE_TAKEN',
      onExhausted: () => new Error('REFERENCE_CODE_EXHAUSTED'),
      attempt: async (code) => {
        try {
          return await this.repositories.bookings.create({ ...command, referenceCode: code });
        } catch (error) {
          // A collision on reference_code is vanishingly rare (32^8), but the
          // column is UNIQUE — the mint retries with a fresh code rather than fail.
          if (errorCode(error) === 'REFERENCE_TAKEN') throw error;
          throw this.mapBookingError(error);
        }
      },
    });

    this.notifyAdmins({ id, referenceCode, fullName: input.full_name, packageName: pkg.name });
    return { id, referenceCode };
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
      if (errorCode(error).includes('SLOT_HAS_ACTIVE_BOOKING')) {
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

  async saveSettings(entries: Partial<ConsultationSettings>): Promise<void> {
    await this.repositories.settings.upsert(entries);
  }

  // ----------------------------------------------------------

  /**
   * The booking is already committed — a notify failure must never surface to
   * the visitor as a failed booking, so it is logged rather than rethrown.
   */
  private notifyAdmins(booking: ConsultationBookingNotification): void {
    try {
      this.config.notifyAdmins?.(booking);
    } catch (error) {
      this.config.captureException?.(error, {
        extra: { source: 'consultation.createBooking.notify', id: booking.id },
      });
    }
  }

  private mapBookingError(error: unknown): Error {
    const code = errorCode(error);
    if (code === 'SLOT_TAKEN') return new SlotTakenError(code);
    if (RPC_VALIDATION_CODES.has(code)) return new ConsultationValidationError(code);
    return error instanceof Error ? error : new Error('UNKNOWN');
  }
}
