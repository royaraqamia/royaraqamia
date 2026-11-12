import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/backend/models/database.types';
import { getAdminSupabase } from '@/backend/config/supabase';
import { createFollowsRepository } from '@/backend/repositories/users/follows-repository';
import { createPublicUsersRepository } from '@/backend/repositories/users/public-users-repository';
import { createAdminNotificationProducer } from '@/backend/config/notifications';
import { checkRateLimit } from '@/backend/config/rate-limiter';
import { FollowsService } from '@/backend/services/users/follows-service';

/**
 * The follow graph, wired.
 *
 * Service-role on purpose: the service already decides who may read which list
 * (only the owner of the list), and the target lookup has to see a hidden or
 * unconfirmed row in order to refuse it - the public directory's own reads
 * filter those out and would answer "no such member" for a different reason.
 * The push producer is the fail-safe one, so a delivery outage cannot fail a
 * follow.
 */
export function createFollowsService(supabase?: SupabaseClient<Database>): FollowsService {
  const client = supabase ?? getAdminSupabase();

  return new FollowsService({
    follows: createFollowsRepository(client),
    users: createPublicUsersRepository(client),
    notify: getNotificationProducer(),
    checkRateLimit: (key, limit, windowMs) =>
      checkRateLimit(key, limit, windowMs, { failClosed: true }),
  });
}

/**
 * The fail-safe producer, built once per process.
 *
 * `createAdminNotificationProducer()` builds the web-push and FCM services, and
 * this factory runs on every feed render (the following count) as well as on
 * every follow. Constructing a notifier per request was pure overhead on a
 * surface that usually sends nothing.
 */
let producer: ReturnType<typeof createAdminNotificationProducer> | null = null;

function getNotificationProducer(): ReturnType<typeof createAdminNotificationProducer> {
  producer ??= createAdminNotificationProducer();
  return producer;
}
