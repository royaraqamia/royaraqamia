import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/backend/models/database.types';
import { createSupabaseConsultationPackagesRepository } from '@/backend/repositories/consultation/supabase-packages';
import { createSupabaseAvailabilitySlotsRepository } from '@/backend/repositories/consultation/supabase-slots';
import { createSupabaseConsultationBookingsRepository } from '@/backend/repositories/consultation/supabase-bookings';
import { createSupabaseConsultationSettingsRepository } from '@/backend/repositories/consultation/supabase-settings';

export function createConsultationRepositories(supabase: SupabaseClient<Database>) {
  return {
    packages: createSupabaseConsultationPackagesRepository(supabase),
    slots: createSupabaseAvailabilitySlotsRepository(supabase),
    bookings: createSupabaseConsultationBookingsRepository(supabase),
    settings: createSupabaseConsultationSettingsRepository(supabase),
  };
}

export type ConsultationRepositories = ReturnType<typeof createConsultationRepositories>;

export type {
  AdminAvailabilitySlot,
  AvailabilitySlotsReader,
  AvailabilitySlotsWriter,
  BookingListResult,
  ConsultationPackagesReader,
  ConsultationPackagesWriter,
  ConsultationSettingsReader,
  ConsultationSettingsWriter,
  ConsultationBookingsReader,
  ConsultationBookingsWriter,
  CreateBookingCommand,
} from '@/backend/repositories/consultation/consultation-repository';
