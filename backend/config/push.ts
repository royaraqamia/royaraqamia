import * as webpush from 'web-push';
import { env } from '@/backend/config/env';
import { getAdminSupabase } from '@/backend/config/supabase';
import { createPushSubscriptionsRepository } from '@/backend/repositories/push/supabase-repository';
import type { PushSubscriptionRepository } from '@/backend/repositories/push/push-subscriptions-repository';
import { PushService, type WebPushAdapter } from '@/backend/services/push/push-service';

function createRealWebPushAdapter(): WebPushAdapter {
  return {
    setVapidDetails(subject, publicKey, privateKey) {
      webpush.setVapidDetails(subject, publicKey, privateKey);
    },
    sendNotification(subscription, payload, options) {
      return webpush.sendNotification(subscription, payload, {
        TTL: options?.TTL,
        urgency: options?.urgency,
      });
    },
  };
}

/**
 * Fail-safe, service-role-backed push notifier for notification producers and
 * the admin broadcaster. When the VAPID keys are absent (dev/local/tests) the
 * returned service is a graceful no-op, so the rest of the pipeline keeps
 * working. Dispatch/prune use the admin client so RLS never blocks fan-out.
 */
export function createPushNotifier(): PushService {
  const vapid = {
    publicKey: env.vapidPublicKey,
    privateKey: env.vapidPrivateKey,
    subject: env.vapidSubject,
  };
  const enabled = Boolean(vapid.publicKey && vapid.privateKey && vapid.subject);
  const repository: PushSubscriptionRepository = enabled
    ? createPushSubscriptionsRepository(getAdminSupabase())
    : {
        upsert: async () => undefined,
        findByUserId: async () => [],
        findForUsers: async () => [],
        removeByEndpoint: async () => undefined,
        removeEndpoint: async () => undefined,
      };

  return new PushService({
    repository,
    enabled,
    vapid,
    allowlist: env.pushEndpointAllowlist,
    adapter: createRealWebPushAdapter(),
  });
}
