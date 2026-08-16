import { getAuthUser } from '@/backend/middleware/auth-guard';
import { createPushSubscriptionsRepository } from '@/backend/repositories/push/supabase-repository';
import { checkRateLimit } from '@/backend/config/rate-limiter';
import { env } from '@/backend/config/env';
import { PushSubscriptionSchema, PushUnsubscribeSchema } from '@/shared/contracts/push';
import { jsonResult, type HttpResult } from '@/backend/transport/http-result';

const SUBSCRIBE_RATE_LIMIT = 20;
const SUBSCRIBE_RATE_WINDOW_MS = 3600_000;

/**
 * CSRF guard for the subscription endpoints: a cross-site form/JS POST carries
 * the victim's session cookie, so without this an attacker could register
 * their own endpoint under the victim's account and receive the victim's
 * notifications. Only accept requests that are provably same-origin.
 */
function isSameOrigin(headers: Headers): boolean {
  if (headers.get('sec-fetch-site') === 'same-origin') return true;
  const origin = headers.get('origin');
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(env.baseUrl).origin;
  } catch {
    return false;
  }
}

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
