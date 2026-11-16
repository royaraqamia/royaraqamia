import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/backend/models/database.types';
import { getAdminSupabase } from '@/backend/config/supabase';
import { createSupabaseSkillTelemetryRepository } from '@/backend/repositories/chat/skill-telemetry-repository';
import {
  createSkillTelemetryService,
  type SkillTelemetryService,
} from '@/backend/services/chat/skill-telemetry-service';

/**
 * The specialist tallies in the Admin Console (#1449).
 *
 * Service role on purpose: `agent_turns` and `agent_turn_skills` have no member
 * policy at all, because the member reads their answer in `chat_messages`. The
 * read is reachable only behind `withAdminUser`, so the client identity never
 * decides what the operator sees.
 */
export function createDefaultSkillTelemetryService(
  supabase: SupabaseClient<Database> = getAdminSupabase()
): SkillTelemetryService {
  return createSkillTelemetryService({
    telemetry: createSupabaseSkillTelemetryRepository(supabase),
  });
}
