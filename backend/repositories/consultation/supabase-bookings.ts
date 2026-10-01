import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/backend/models/database.types';
import type {
  AvailabilitySlot,
  ConsultationBooking,
  ConsultationBookingStatus,
} from '@/shared/contracts/consultation';
import type {
  BookingListResult,
  BookingOwnedEdit,
  ConsultationBookingsReader,
  ConsultationBookingsWriter,
  CreateBookingCommand,
} from '@/backend/repositories/consultation/consultation-repository';

type BookingRow = Database['public']['Tables']['consultation_bookings']['Row'];

interface BookingRowWithPackage extends BookingRow {
  consultation_packages: { name: string } | null;
}

interface SlotLinkRow {
  booking_id: string;
  availability_slots: {
    id: string;
    starts_at: string;
    ends_at: string;
  } | null;
}

function extractRpcErrorCode(message: string | undefined): string {
  if (!message) return 'UNKNOWN';
  // Raised exceptions surface as plain messages; keep the first token.
  return message.trim().split(/[\n:]/).at(0) ?? 'UNKNOWN';
}

async function loadSessions(
  supabase: SupabaseClient<Database>,
  bookingIds: string[]
): Promise<Map<string, AvailabilitySlot[]>> {
  const map = new Map<string, AvailabilitySlot[]>();
  if (bookingIds.length === 0) return map;

  const { data, error } = await supabase
    .from('consultation_booking_slots')
    .select('booking_id, availability_slots(id, starts_at, ends_at)')
    .in('booking_id', bookingIds);

  if (error) throw error;

  for (const row of (data ?? []) as unknown as SlotLinkRow[]) {
    const slot = row.availability_slots;
    if (!slot) continue;
    const sessions = map.get(row.booking_id) ?? [];
    sessions.push({ id: slot.id, starts_at: slot.starts_at, ends_at: slot.ends_at });
    map.set(row.booking_id, sessions);
  }

  return map;
}

function toBooking(row: BookingRowWithPackage, sessions: AvailabilitySlot[]): ConsultationBooking {
  return {
    id: row.id,
    reference_code: row.reference_code,
    user_id: row.user_id,
    package_id: row.package_id,
    package_name: row.consultation_packages?.name ?? null,
    full_name: row.full_name,
    phone_whatsapp: row.phone_whatsapp,
    email: row.email,
    topic_description: row.topic_description,
    status: row.status as ConsultationBookingStatus,
    confirmed_at: row.confirmed_at,
    rejected_reason: row.rejected_reason,
    created_at: row.created_at,
    updated_at: row.updated_at,
    edited_at: row.edited_at,
    sessions,
  };
}

export function createSupabaseConsultationBookingsRepository(
  supabase: SupabaseClient<Database>
): ConsultationBookingsReader & ConsultationBookingsWriter {
  const baseSelect = '*, consultation_packages(name)';

  async function fetchMany(rows: BookingRow[]): Promise<ConsultationBooking[]> {
    const sessionMap = await loadSessions(
      supabase,
      rows.map((r) => r.id)
    );
    return rows.map((row) => toBooking(row as BookingRowWithPackage, sessionMap.get(row.id) ?? []));
  }

  return {
    async listForAdmin(page, pageSize, status?): Promise<BookingListResult> {
      // `estimated` avoids a full filtered COUNT on every admin page; the
      // dashboard shows one page at a time and only displays `data`.
      let query = supabase.from('consultation_bookings').select(baseSelect, { count: 'estimated' });

      if (status) query = query.eq('status', status);

      const from = (page - 1) * pageSize;
      const { data, count, error } = await query
        .order('created_at', { ascending: false })
        .range(from, from + pageSize - 1);

      if (error) throw error;
      return { data: await fetchMany(data ?? []), total: count ?? 0 };
    },

    async listByUser(userId: string): Promise<ConsultationBooking[]> {
      const { data, error } = await supabase
        .from('consultation_bookings')
        .select(baseSelect)
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return fetchMany((data ?? []) as BookingRow[]);
    },

    async create(command: CreateBookingCommand): Promise<string> {
      const { data, error } = await supabase.rpc('create_consultation_booking', {
        p_user_id: command.userId ?? undefined,
        p_package_id: command.package_id,
        p_slot_ids: command.slot_ids,
        p_full_name: command.full_name,
        p_phone_whatsapp: command.phone_whatsapp,
        p_email: command.email ?? undefined,
        p_topic_description: command.topic_description,
        p_reference_code: command.referenceCode,
      });

      if (error) throw new Error(extractRpcErrorCode(error.message));
      if (!data) throw new Error('UNKNOWN');
      return data;
    },

    async confirm(bookingId): Promise<void> {
      const { error } = await supabase
        .from('consultation_bookings')
        .update({ status: 'confirmed', confirmed_at: new Date().toISOString() })
        .eq('id', bookingId)
        .eq('status', 'pending');

      if (error) throw error;
    },

    async reject(bookingId, reason?): Promise<void> {
      const { error } = await supabase
        .from('consultation_bookings')
        .update({
          status: 'rejected',
          rejected_reason: reason?.trim() ? reason.trim() : null,
        })
        .eq('id', bookingId)
        .eq('status', 'pending');

      if (error) throw error;
    },

    async updateContactOwned(
      bookingId: string,
      userId: string,
      edit: Pick<BookingOwnedEdit, 'full_name' | 'phone_whatsapp' | 'email' | 'topic_description'>
    ): Promise<ConsultationBooking | null> {
      const now = new Date().toISOString();
      const { error } = await supabase
        .from('consultation_bookings')
        .update({
          full_name: edit.full_name,
          phone_whatsapp: edit.phone_whatsapp,
          email: edit.email,
          topic_description: edit.topic_description,
          edited_at: now,
          updated_at: now,
        })
        .eq('id', bookingId)
        .eq('user_id', userId);

      if (error) throw error;

      // Re-read with sessions and the package name, so the caller gets the same
      // shape the list does rather than a partial row.
      const { data, error: readError } = await supabase
        .from('consultation_bookings')
        .select(baseSelect)
        .eq('id', bookingId)
        .maybeSingle();

      if (readError) throw readError;
      if (!data) return null;

      const [booking] = await fetchMany([data as BookingRow]);
      return booking ?? null;
    },

    async reschedule(bookingId: string, packageId: string, slotIds: string[]): Promise<void> {
      const { error } = await supabase.rpc('reschedule_consultation_booking', {
        p_booking_id: bookingId,
        p_package_id: packageId,
        p_slot_ids: slotIds,
      });

      if (error) {
        const code = extractRpcErrorCode(error.message);
        // BOOKING_NOT_FOUND doubles as "not yours": the RPC's ownership check
        // and a genuine absence are indistinguishable to the caller on purpose.
        if (code === 'BOOKING_NOT_FOUND') throw new Error('BOOKING_NOT_FOUND');
        throw new Error(code);
      }
    },
  };
}
