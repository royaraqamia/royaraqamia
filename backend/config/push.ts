import * as webpush from 'web-push';
import { env } from '@/backend/config/env';
import { getAdminSupabase } from '@/backend/config/supabase';
import { createPushSubscriptionsRepository } from '@/backend/repositories/push/supabase-repository';
import { createDevicePushTokensRepository } from '@/backend/repositories/push/supabase-device-tokens-repository';
import type { PushSubscriptionRepository } from '@/backend/repositories/push/push-subscriptions-repository';
import type { DevicePushTokenRepository } from '@/backend/repositories/push/device-push-tokens-repository';
import { PushService, type WebPushAdapter } from '@/backend/services/push/push-service';
import { FcmPushService } from '@/backend/services/push/fcm-push-service';
import { createFcmAdapter } from '@/backend/services/push/fcm-client';
import { PushFanout } from '@/backend/services/push/push-fanout';

export { runAfter } from '@/backend/config/after';

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

const NO_SUBSCRIPTIONS: PushSubscriptionRepository = {
  upsert: async () => undefined,
  touch: async () => undefined,
  findByUserId: async () => [],
  findForUsers: async () => [],
  removeByEndpoint: async () => undefined,
  removeEndpoint: async () => undefined,
};

const NO_DEVICE_TOKENS: DevicePushTokenRepository = {
  upsert: async () => undefined,
  findByUserId: async () => [],
  findForUsers: async () => [],
  removeByToken: async () => undefined,
  removeToken: async () => undefined,
};

/**
 * Browser push. When the VAPID keys are absent (dev/local/tests) the service is
 * a graceful no-op, so the rest of the pipeline keeps working.
 */
function createWebPushService(): PushService {
  const vapid = {
    publicKey: env.vapidPublicKey,
    privateKey: env.vapidPrivateKey,
    subject: env.vapidSubject,
  };
  const enabled = Boolean(vapid.publicKey && vapid.privateKey && vapid.subject);

  return new PushService({
    repository: enabled ? createPushSubscriptionsRepository(getAdminSupabase()) : NO_SUBSCRIPTIONS,
    enabled,
    vapid,
    allowlist: env.pushEndpointAllowlist,
    adapter: createRealWebPushAdapter(),
  });
}

/**
 * Native push for the Android shell. Disabled — and therefore silent — until the
 * Firebase service account is configured, which keeps every environment that
 * does not run the app (tests, previews without the secrets) a no-op.
 */
export function createFcmPushService(): FcmPushService {
  const projectId = env.fcmProjectId;
  const clientEmail = env.fcmClientEmail;
  const privateKey = env.fcmPrivateKey;

  if (!projectId || !clientEmail || !privateKey) {
    return new FcmPushService({ repository: NO_DEVICE_TOKENS, enabled: false });
  }

  return new FcmPushService({
    repository: createDevicePushTokensRepository(getAdminSupabase()),
    enabled: true,
    adapter: createFcmAdapter({ projectId, clientEmail, privateKey }),
  });
}

/**
 * The one notifier every producer uses. It fans a payload out to both
 * transports, because a user can be reachable on a desktop browser and on the
 * Android shell at once and neither channel can see the other's subscriptions.
 * Dispatch and prune run with the admin client so RLS never blocks fan-out.
 */
export function createPushNotifier(): PushFanout {
  return new PushFanout([createWebPushService(), createFcmPushService()]);
}
