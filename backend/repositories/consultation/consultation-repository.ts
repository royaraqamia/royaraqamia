import type {
  AvailabilitySlot,
  ConsultationBooking,
  ConsultationBookingStatus,
  ConsultationPackage,
  ConsultationSettings,
  CreateBookingInput,
  PackageUpsertInput,
  SlotCreateInput,
} from '@/shared/contracts/consultation';

export interface AdminAvailabilitySlot extends AvailabilitySlot {
  /** Booking currently holding this slot, if any. */
  active_booking_id: string | null;
}

// ------------------------------------------------------------
// Packages
// ------------------------------------------------------------

export interface ConsultationPackagesReader {
  listActive(): Promise<ConsultationPackage[]>;
  listAll(): Promise<ConsultationPackage[]>;
  getById(id: string): Promise<ConsultationPackage | null>;
}

export interface ConsultationPackagesWriter {
  create(input: PackageUpsertInput): Promise<ConsultationPackage>;
  update(id: string, input: PackageUpsertInput): Promise<ConsultationPackage>;
  /** Hard-deletes; the FK from historical bookings blocks it when they exist. */
  remove(id: string): Promise<void>;
}

// ------------------------------------------------------------
// Slots
// ------------------------------------------------------------

export interface AvailabilitySlotsReader {
  /** Future slots not held by an active booking. */
  listAvailable(nowIso: string): Promise<AvailabilitySlot[]>;
  /** Every slot from `fromIso` onward with its active-reservation info. */
  listFrom(fromIso: string): Promise<AdminAvailabilitySlot[]>;
}

export interface AvailabilitySlotsWriter {
  create(input: SlotCreateInput): Promise<AvailabilitySlot>;
  /** The DB trigger refuses deletion while an active reservation exists. */
  remove(id: string): Promise<void>;
}

// ------------------------------------------------------------
// Bookings
// ------------------------------------------------------------

export interface BookingListResult {
  data: ConsultationBooking[];
  total: number;
}

export interface ConsultationBookingsReader {
  listByUser(userId: string): Promise<ConsultationBooking[]>;
  listForAdmin(
    page: number,
    pageSize: number,
    status?: ConsultationBookingStatus
  ): Promise<BookingListResult>;
}

export interface CreateBookingCommand extends CreateBookingInput {
  userId: string;
  /** Authenticated account email, injected server-side (not collected in the form). */
  email: string;
}

export interface ConsultationBookingsWriter {
  /** Atomic RPC insert of the header + N slot links. Returns the booking id. */
  create(command: CreateBookingCommand): Promise<string>;
  markReceiptSent(userId: string, bookingId: string): Promise<void>;
  cancelByUser(userId: string, bookingId: string): Promise<void>;
  /** Flips stale pendings to expired; returns affected row count. */
  expireStale(): Promise<number>;
  confirm(bookingId: string): Promise<void>;
  reject(bookingId: string, reason?: string): Promise<void>;
}

// ------------------------------------------------------------
// Settings
// ------------------------------------------------------------

export interface ConsultationSettingsReader {
  read(): Promise<Partial<ConsultationSettings>>;
}

export interface ConsultationSettingsWriter {
  upsert(entries: Partial<ConsultationSettings>): Promise<void>;
}
