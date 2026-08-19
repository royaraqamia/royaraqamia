import { getDefaultEmailClient } from '@/backend/config/email';
import { env } from '@/backend/config/env';
import { getAdminSupabase } from '@/backend/config/supabase';
import { createAdminUsersRepository } from '@/backend/repositories/users/admin-users-repository';
import { EmailBroadcastService } from '@/backend/services/emails/email-broadcast-service';
import { logger } from '@/backend/shared/logger';

export interface AdminEmailBroadcastInput {
  subject: string;
  body?: string;
}

export type AdminEmailBroadcaster = (
  input: AdminEmailBroadcastInput,
  userIds?: string[]
) => Promise<number>;

/**
 * Fail-safe admin email broadcaster: resolves recipient emails via the service
 * role and fans out to Resend in batches. Never throws to callers. When
 * `RESEND_API_KEY` is absent (dev/local/tests) it degrades to a graceful
 * no-op returning 0, so the rest of the broadcast pipeline keeps working.
 */
export function createAdminEmailBroadcaster(): AdminEmailBroadcaster {
  const enabled = Boolean(env.resendApiKey);
  if (!enabled) {
    return async () => 0;
  }

  const usersRepository = createAdminUsersRepository(getAdminSupabase());
  const service = new EmailBroadcastService(usersRepository, getDefaultEmailClient());

  return async (input, userIds) => {
    try {
      return await service.broadcast(input, userIds);
    } catch (error) {
      logger.error('Failed to broadcast email', { error: String(error) });
      return 0;
    }
  };
}
