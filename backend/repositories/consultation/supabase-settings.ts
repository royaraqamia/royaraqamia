import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/backend/models/database.types';
import type { ConsultationSettings } from '@/shared/contracts/consultation';
import { SETTINGS_KEYS } from '@/shared/contracts/consultation';
import type {
  ConsultationSettingsReader,
  ConsultationSettingsWriter,
} from '@/backend/repositories/consultation/consultation-repository';

type SettingsKey = (typeof SETTINGS_KEYS)[number];

export function createSupabaseConsultationSettingsRepository(
  supabase: SupabaseClient<Database>
): ConsultationSettingsReader & ConsultationSettingsWriter {
  return {
    async read(): Promise<Partial<ConsultationSettings>> {
      const { data, error } = await supabase.from('consultation_settings').select('key, value');
      if (error) throw error;

      const result: Partial<ConsultationSettings> = {};
      for (const row of data ?? []) {
        if ((SETTINGS_KEYS as readonly string[]).includes(row.key)) {
          result[row.key as SettingsKey] = row.value;
        }
      }
      return result;
    },

    async upsert(entries: Partial<ConsultationSettings>): Promise<void> {
      const rows = Object.entries(entries)
        .filter((entry): entry is [SettingsKey, string] => Boolean(entry[1]))
        .map(([key, value]) => ({ key, value }));

      if (rows.length === 0) return;

      const { error } = await supabase
        .from('consultation_settings')
        .upsert(rows, { onConflict: 'key' });

      if (error) throw error;
    },
  };
}
