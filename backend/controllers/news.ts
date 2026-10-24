import { createNewsPreferencesServiceFor } from '@/backend/config/news';
import { listNewsSources } from '@/backend/services/news/news-catalogue';
import { messageError } from '@/backend/transport/authenticated-handler';
import { isSameOrigin } from '@/backend/transport/http';
import { jsonResult, type HttpResult } from '@/backend/transport/http-result';
import { withAuthenticatedUser } from '@/backend/transport/session-handler';
import { newsSourcePreferencesSchema } from '@/shared/contracts/news';

/**
 * The reader's news-source selection, for `/account/news`.
 *
 * A read and a write over one table, behind a session: the catalogue is public
 * but which sources an account kept is not, and returning both in one call is
 * what lets the settings page stay a data-free shell (ADR-0031).
 */
export async function getMyNewsSources(): Promise<HttpResult> {
  return withAuthenticatedUser(
    async ({ userId, supabase }) => {
      const selected = await createNewsPreferencesServiceFor(supabase).get(userId);
      return jsonResult(200, { success: true, sources: listNewsSources(), selected });
    },
    { mapError: messageError(500, 'تعذّر تحميل مصادر الأخبار.') }
  );
}

export async function updateMyNewsSources(body: unknown, headers: Headers): Promise<HttpResult> {
  return withAuthenticatedUser(
    async ({ userId, supabase }) => {
      if (!isSameOrigin(headers)) {
        return jsonResult(403, { success: false, error: 'طلب غير مسموح' });
      }

      const parsed = newsSourcePreferencesSchema.safeParse(body);
      if (!parsed.success) {
        return jsonResult(400, { success: false, error: 'اختيار غير صالح.' });
      }

      const selected = await createNewsPreferencesServiceFor(supabase).save(
        userId,
        parsed.data.sourceIds
      );
      return jsonResult(200, { success: true, selected });
    },
    { mapError: messageError(500, 'تعذّر حفظ مصادر الأخبار.') }
  );
}
