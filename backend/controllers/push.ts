import { timingSafeEqual } from 'crypto';
import { getAuthUser } from '@/backend/middleware/auth-guard';
import { checkRateLimit, getRateLimitDecision } from '@/backend/config/rate-limiter';
import {
  createFcmPushService,
  createPushDeviceService,
  createPushSubscriptionService,
  createPushWebhookService,
  runAfter,
} from '@/backend/config/push';
import { env } from '@/backend/config/env';
import {
  PushDeviceTokenSchema,
  PushDeviceUnregisterSchema,
  PushSubscriptionSchema,
  PushUnsubscribeSchema,
  PushWakeSchema,
  PushWebhookSchema,
} from '@/shared/contracts/push';
import { isSameOrigin } from '@/backend/transport/http';
import { jsonResult, type HttpResult } from '@/backend/transport/http-result';

const SUBSCRIBE_RATE_LIMIT = 20;
const SUBSCRIBE_RATE_WINDOW_MS = 3600_000;
const DEVICE_RATE_LIMIT = 20;
const DEVICE_RATE_WINDOW_MS = 3600_000;
const WAKE_RATE_LIMIT = 60;
const WAKE_RATE_WINDOW_MS = 3600_000;

/** `Retry-After` is whole seconds, and never 0: a client must wait at least a moment. */
function retryAfterSeconds(retryAfterMs: number): string {
  return String(Math.max(1, Math.ceil(retryAfterMs / 1000)));
}

/**
 * Registers (or refreshes) this browser's Web Push subscription.
 *
 * The write runs with the admin client on purpose, mirroring `registerDeviceToken`:
 * an endpoint is unique per browser install, so when one user signs out and
 * another signs in on the same browser the row has to change owner — a hand-over
 * that "own rows only" RLS cannot express. The owner is still taken from the
 * session, never from the body.
 */
export async function subscribePush(body: unknown, headers: Headers): Promise<HttpResult> {
  try {
    const { user } = await getAuthUser();
    if (!user) {
      return jsonResult(401, {
        success: false,
        code: 'session_expired',
        error: 'غير مصرح. يرجى تسجيل الدُّخول.',
      });
    }
    if (!isSameOrigin(headers)) {
      return jsonResult(403, { success: false, error: 'طلب غير مسموح' });
    }

    const parsed = PushSubscriptionSchema.safeParse(body);
    if (!parsed.success) {
      return jsonResult(400, { success: false, error: 'بيانات الاشتراك غير صحيحة' });
    }

    const decision = await getRateLimitDecision(
      `push:subscribe:${user.id}`,
      SUBSCRIBE_RATE_LIMIT,
      SUBSCRIBE_RATE_WINDOW_MS
    );
    if (!decision.allowed) {
      // The wait travels with the refusal: a client that retries on its own
      // schedule keeps a sliding window full and locks itself out for good.
      return jsonResult(
        429,
        { success: false, code: 'rate_limited', error: 'تم تجاوز حد الاشتراك في الإشعارات' },
        { headers: { 'Retry-After': retryAfterSeconds(decision.retryAfterMs) } }
      );
    }

    // user_id always comes from the session, never from the client body.
    await createPushSubscriptionService().subscribe(user.id, {
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
      return jsonResult(401, { success: false, error: 'غير مصرح. يرجى تسجيل الدُّخول.' });
    }
    if (!isSameOrigin(headers)) {
      return jsonResult(403, { success: false, error: 'طلب غير مسموح' });
    }

    const parsed = PushUnsubscribeSchema.safeParse(body);
    if (!parsed.success) {
      return jsonResult(400, { success: false, error: 'بيانات إلغاء الاشتراك غير صحيحة' });
    }

    await createPushSubscriptionService(supabase).unsubscribe(user.id, parsed.data.endpoint);

    return jsonResult(200, { success: true });
  } catch {
    return jsonResult(500, { success: false, error: 'فشل إلغاء الاشتراك' });
  }
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
      return jsonResult(401, { success: false, error: 'غير مصرح. يرجى تسجيل الدُّخول.' });
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

    await createPushDeviceService().register(user.id, {
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
      return jsonResult(401, { success: false, error: 'غير مصرح. يرجى تسجيل الدُّخول.' });
    }
    if (!isSameOrigin(headers)) {
      return jsonResult(403, { success: false, error: 'طلب غير مسموح' });
    }

    const parsed = PushDeviceUnregisterSchema.safeParse(body);
    if (!parsed.success) {
      return jsonResult(400, { success: false, error: 'بيانات الجهاز غير صحيحة' });
    }

    await createPushDeviceService(supabase).unregister(user.id, parsed.data.token);

    return jsonResult(200, { success: true });
  } catch {
    return jsonResult(500, { success: false, error: 'فشل إلغاء تسجيل الجهاز' });
  }
}

/**
 * Wakes the account's *other* devices so they pull (ADR-0059, ADR-0060).
 *
 * A device calls this at the one moment it knows the account moved: right after
 * its own drain delivered a write. The wake carries no state and can only cause
 * the receiver to pull, so the worst a caller can do with this endpoint is spend
 * their own devices' battery — which is why the guard is a per-user rate limit
 * rather than a role, and why it never fans out to anyone but the caller.
 */
export async function wakeDevices(body: unknown, headers: Headers): Promise<HttpResult> {
  try {
    const { user } = await getAuthUser();
    if (!user) {
      return jsonResult(401, { success: false, error: 'غير مصرح. يرجى تسجيل الدُّخول.' });
    }
    if (!isSameOrigin(headers)) {
      return jsonResult(403, { success: false, error: 'طلب غير مسموح' });
    }

    const parsed = PushWakeSchema.safeParse(body ?? {});
    if (!parsed.success) {
      return jsonResult(400, { success: false, error: 'بيانات غير صحيحة' });
    }

    const allowed = await checkRateLimit(
      `push:wake:${user.id}`,
      WAKE_RATE_LIMIT,
      WAKE_RATE_WINDOW_MS
    );
    if (!allowed) {
      return jsonResult(429, { success: false, error: 'تم تجاوز حد التنبيه' });
    }

    runAfter(() => {
      void createFcmPushService().sendWakeToUser(user.id, { excludeToken: parsed.data.token });
    });

    return jsonResult(202, { success: true });
  } catch {
    return jsonResult(500, { success: false, error: 'فشل إرسال التنبيه' });
  }
}

/**
 * Webhook for DB-side producers (pg_net → habit reminders). The DB POSTs the
 * ids of the bell rows it just wrote; this verifies the shared bearer token and
 * hands them to one service that dedupes per user per day and fans out the push.
 *
 * The day is Damascus, the one the reminder selection fires on: on the UTC day
 * the key would flip at 03:00 local, handing a user a second reminder in one day
 * — or collapsing two days into one.
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

    const { notified } = await createPushWebhookService().handle(parsed.data.notification_ids);

    return jsonResult(202, { success: true, notified });
  } catch {
    return jsonResult(500, { success: false, error: 'فشل معالجة طلب الإشعارات' });
  }
}
