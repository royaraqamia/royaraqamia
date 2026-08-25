import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/backend/models/database.types';
import type { AvailabilitySlot, SlotCreateInput } from '@/shared/contracts/consultation';
import type {
  AdminAvailabilitySlot,
  AvailabilitySlotsReader,
  AvailabilitySlotsWriter,
} from '@/backend/repositories/consultation/consultation-repository';

type SlotRow = Database['public']['Tables']['availability_slots']['Row'];
type JunctionRow = Database['public']['Tables']['consultation_booking_slots']['Row'];

function toSlot(row: SlotRow): AvailabilitySlot {
  return { id: row.id, starts_at: row.starts_at, ends_at: row.ends_at };
}

export function createSupabaseAvailabilitySlotsRepository(
  supabase: SupabaseClient<Database>
): AvailabilitySlotsReader & AvailabilitySlotsWriter {
  return {
    async listAvailable(nowIso): Promise<AvailabilitySlot[]> {
      const { data: slots, error: slotsError } = await supabase
        .from('availability_slots')
        .select('*')
        .gt('starts_at', nowIso)
        .order('starts_at', { ascending: true });

      if (slotsError) throw slotsError;
      if (!slots || slots.length === 0) return [];

      const { data: held, error: heldError } = await supabase
        .from('consultation_booking_slots')
        .select('slot_id')
        .eq('is_active', true)
        .in(
          'slot_id',
          slots.map((s) => s.id)
        );

      if (heldError) throw heldError;

      const heldIds = new Set((held ?? []).map((row) => row.slot_id));
      return slots.filter((s) => !heldIds.has(s.id)).map(toSlot);
    },

    async listFrom(fromIso): Promise<AdminAvailabilitySlot[]> {
      const { data: slots, error: slotsError } = await supabase
        .from('availability_slots')
        .select('*')
        .gte('starts_at', fromIso)
        .order('starts_at', { ascending: true });

      if (slotsError) throw slotsError;
      if (!slots || slots.length === 0) return [];

      const { data: held, error: heldError } = await supabase
        .from('consultation_booking_slots')
        .select('slot_id, booking_id')
        .eq('is_active', true)
        .in(
          'slot_id',
          slots.map((s) => s.id)
        );

      if (heldError) throw heldError;

      const heldBySlot = new Map<string, string>();
      for (const row of (held ?? []) as Pick<JunctionRow, 'slot_id' | 'booking_id'>[]) {
        heldBySlot.set(row.slot_id, row.booking_id);
      }

      return slots.map((s) => ({
        ...toSlot(s),
        active_booking_id: heldBySlot.get(s.id) ?? null,
      }));
    },

    async create(input: SlotCreateInput): Promise<AvailabilitySlot> {
      const { data, error } = await supabase
        .from('availability_slots')
        .insert({ starts_at: input.starts_at, ends_at: input.ends_at })
        .select('*')
        .single();

      if (error) throw error;
      return toSlot(data);
    },

    async remove(id): Promise<void> {
      const { error } = await supabase.from('availability_slots').delete().eq('id', id);
      if (error) throw error;
    },
  };
}
