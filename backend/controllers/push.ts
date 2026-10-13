import { timingSafeEqual } from 'crypto';
import { getAuthUser } from '@/backend/middleware/auth-guard';
import { createPushSubscriptionsRepository } from '@/backend/repositories/push/supabase-repository';
import { createDevicePushTokensRepository } from '@/backend/repositories/push/supabase-device-tokens-repository';
import { checkRateLimit } from '@/backend/config/rate-limiter';
import { createPushNotifier, runAfter } from '@/backend/config/push';
import { getAdminSupabase } from '@/backend/config/supabase';
import { mapWithConcurrency } from '@/backend/services/push/dispatch';
import { env } from '@/backend/config/env';
import {
  PushDeviceTokenSchema,
  PushDeviceUnregisterSchema,
  PushSubscriptionSchema,
  PushUnsubscribeSchema,
  PushWebhookSchema,
} from '@/shared/contracts/push';
import { isSameOrigin } from '@/backend/transport/http';
import { jsonResult, type HttpResult } from '@/backend/transport/http-result';

const SUBSCRIBE_RATE_LIMIT = 20;
const SUBSCRIBE_RATE_WINDOW_MS = 3600_000;
const DEVICE_RATE_LIMIT = 20;
const DEVICE_RATE_WINDOW_MS = 3600_000;
const WEBHOOK_RATE_WINDOW_MS = 24 * 60 * 60 * 1000;

export async function subscribePush(body: unknown, headers: Headers): Promise<HttpResult> {
  try {
    const { user, supabase } = await getAuthUser();
    if (!user) {
      return jsonResult(401, { success: false, error: 'غير مصرح. يرجى تسجيل الدخول.' });
    }
    if (!isSameOrigin(headers)) {
      return jsonResult(403, { success: false, error: 'طلب غير مسموح' });
    }

    const parsed = PushSubscriptionSchema.safeParse(body);
    if (!parsed.success) {
      return jsonResult(400, { success: false, error: 'بيانات الاشتراك غير صحيحة' });
    }

    const allowed = await checkRateLimit(
      `push:subscribe:${user.id}`,
      SUBSCRIBE_RATE_LIMIT,
      SUBSCRIBE_RATE_WINDOW_MS
    );
    if (!allowed) {
      return jsonResult(429, { success: false, error: 'تم تجاوز حد الاشتراك في الإشعارات' });
    }

    // user_id always comes from the session, never from the client body.
    await createPushSubscriptionsRepository(supabase).upsert(user.id, {
      endpoint: parsed.data.endpoint,
      p256dh: parsed.data.keys.p256dh,
      auth: parsed.data.keys.auth,
      userAgent: headers.get('user-agent'),
    });

    return jsonResult(200, { success: true });
  } catch {
    return jsonResult(500, { success: false, error: 'فشل حفظ الاشتراك' });
  }
}

export async function unsubscribePush(body: unknown, headers: Headers): Promise<HttpResult> {
  try {
    const { user, supabase } = await getAuthUser();
    if (!user) {
      return jsonResult(401, { success: false, error: 'غير مصرح. يرجى تسجيل الدخول.' });
    }
    if (!isSameOrigin(headers)) {
      return jsonResult(403, { success: false, error: 'طلب غير مسموح' });
    }

    const parsed = PushUnsubscribeSchema.safeParse(body);
    if (!parsed.success) {
      return jsonResult(400, { success: false, error: 'بيانات إلغاء الاشتراك غير صحيحة' });
    }

    await createPushSubscriptionsRepository(supabase).removeByEndpoint(
      user.id,
      parsed.data.endpoint
    );

    return jsonResult(200, { success: true });
  } catch {
    return jsonResult(500, { success: false, error: 'فشل إلغاء الاشتراك' });
  }
}

function utcDateKey(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Registers (or refreshes) the calling device's FCM token.
 *
 * The write runs with the admin client on purpose: a token is unique per
 * install, so when one user signs out and another signs in on the same phone the
 * row has to change owner — a hand-over that "own rows only" RLS cannot express.
 * The owner is still taken from the session, never from the body.
 */
export async function registerDeviceToken(body: unknown, headers: Headers): Promise<HttpResult> {
  try {
    const { user } = await getAuthUser();
    if (!user) {
      return jsonResult(401, { success: false, error: 'غير مصرح. يرجى تسجيل الدخول.' });
    }
    if (!isSameOrigin(headers)) {
      return jsonResult(403, { success: false, error: 'طلب غير مسموح' });
    }

    const parsed = PushDeviceTokenSchema.safeParse(body);
    if (!parsed.success) {
      return jsonResult(400, { success: false, error: 'بيانات الجهاز غير صحيحة' });
    }

    const allowed = await checkRateLimit(
      `push:device:${user.id}`,
      DEVICE_RATE_LIMIT,
      DEVICE_RATE_WINDOW_MS
    );
    if (!allowed) {
      return jsonResult(429, { success: false, error: 'تم تجاوز حد تسجيل الأجهزة' });
    }

    await createDevicePushTokensRepository(getAdminSupabase()).upsert(user.id, {
      token: parsed.data.token,
      platform: parsed.data.platform,
      userAgent: headers.get('user-agent'),
    });

    return jsonResult(200, { success: true });
  } catch {
    return jsonResult(500, { success: false, error: 'فشل تسجيل الجهاز' });
  }
}

/**
 * Drops a token when the user signs out, so the next person to use the device
 * does not inherit their notifications. Caller-scoped: RLS is the guarantee that
 * this can only ever delete the caller's own row.
 */
export async function unregisterDeviceToken(body: unknown, headers: Headers): Promise<HttpResult> {
  try {
    const { user, supabase } = await getAuthUser();
    if (!user) {
      return jsonResult(401, { success: false, error: 'غير مصرح. يرجى تسجيل الدخول.' });
    }
    if (!isSameOrigin(headers)) {
      return jsonResult(403, { success: false, error: 'طلب غير مسموح' });
    }

    const parsed = PushDeviceUnregisterSchema.safeParse(body);
    if (!parsed.success) {
      return jsonResult(400, { success: false, error: 'بيانات الجهاز غير صحيحة' });
    }

    await createDevicePushTokensRepository(supabase).removeByToken(user.id, parsed.data.token);

    return jsonResult(200, { success: true });
  } catch {
    return jsonResult(500, { success: false, error: 'فشل إلغاء تسجيل الجهاز' });
  }
}

/**
 * Webhook for DB-side producers (pg_net → habit reminders). The DB POSTs the
 * affected user ids; this verifies the shared bearer token, guards against
 * pg_net retries with a per-user per-day dedupe, then fans out the push.
 */
export async function webhookPush(body: unknown, headers: Headers): Promise<HttpResult> {
  try {
    const expected = env.pushWebhookToken;
    const supplied = headers.get('authorization') ?? '';
    const token = supplied.startsWith('Bearer ') ? supplied.slice('Bearer '.length) : '';
    if (
      !expected ||
      token.length === 0 ||
      token.length !== expected.length ||
      !timingSafeEqual(Buffer.from(token), Buffer.from(expected))
    ) {
      return jsonResult(401, { success: false, error: 'غير مصرح' });
    }

    const parsed = PushWebhookSchema.safeParse(body);
    if (!parsed.success) {
      return jsonResult(400, { success: false, error: 'بيانات غير صحيحة' });
    }

    const uniqueIds = Array.from(new Set(parsed.data.user_ids));
    const allowedIds: string[] = [];
    // Bounded concurrency: a reminder run can fan out to hundreds of users and
    // each dedupe check is an Upstash round-trip; sequential awaits would
    // stretch past the function duration limit at scale.
    await mapWithConcurrency(uniqueIds, 10, async (userId) => {
      const allowed = await checkRateLimit(
        `push:habit:${userId}:${utcDateKey()}`,
        1,
        WEBHOOK_RATE_WINDOW_MS
      );
      if (allowed) allowedIds.push(userId);
    });

    if (allowedIds.length > 0) {
      runAfter(() => {
        void createPushNotifier().sendToUsers(allowedIds, {
          title: 'تذكير بعادتك اليومية',
          type: 'habit_reminder',
          url: '/habitflow',
        });
      });
    }

    return jsonResult(202, { success: true, notified: allowedIds.length });
  } catch {
    return jsonResult(500, { success: false, error: 'فشل معالجة طلب الإشعارات' });
  }
}
