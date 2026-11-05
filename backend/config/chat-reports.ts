import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/backend/models/database.types';
import { getAdminSupabase } from '@/backend/config/supabase';
import { createPublicUsersRepositoryServer } from '@/backend/config/users';
import { createChatReportsAdminRepository } from '@/backend/repositories/chat/chat-reports-admin-repository';
import {
  createChatReportsAdminService,
  type ChatReportsAdminService,
} from '@/backend/services/chat/chat-reports-admin-service';

/**
 * The Admin Console's report review queue (ADR-0113).
 *
 * Service-role on purpose: the queue lists every member's report, and the status
 * decision has no client grant at all (#886). Both are reachable only behind
 * `withAdminUser`, so the client identity never decides what the queue contains.
 */
export function createDefaultChatReportsAdminService(
  supabase: SupabaseClient<Database> = getAdminSupabase()
): ChatReportsAdminService {
  return createChatReportsAdminService({
    reports: createChatReportsAdminRepository(supabase),
    users: createPublicUsersRepositoryServer(supabase),
  });
}
