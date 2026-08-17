import * as Sentry from '@sentry/nextjs';
import { requireAdminAuth } from '@/backend/middleware/admin-auth-guard';
import { createAdminUsersService } from '@/backend/config/users';
import { AdminUsersSearchSchema } from '@/shared/contracts/users';
import { jsonResult, type HttpResult } from '@/backend/transport/http-result';

export async function listAdminUsers(query: {
  search?: string;
  limit?: number | string;
}): Promise<HttpResult> {
  try {
    await requireAdminAuth();
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return jsonResult(401, { users: [], error: 'غير مصرح. يرجى تسجيل الدخول.' });
    }
    return jsonResult(403, { users: [], error: 'غير مصرح' });
  }

  try {
    const parsed = AdminUsersSearchSchema.safeParse(query);
    if (!parsed.success) {
      return jsonResult(400, { users: [], error: 'معايير البحث غير صالحة' });
    }
    const users = await createAdminUsersService().list(parsed.data.search ?? '', parsed.data.limit);
    return jsonResult(200, { users });
  } catch (error) {
    Sentry.captureException(error);
    return jsonResult(200, { users: [] });
  }
}
