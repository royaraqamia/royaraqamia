import { withAdminUser } from '@/backend/transport/admin-handler';
import { createAdminUsersService } from '@/backend/config/users';
import { AdminUsersSearchSchema } from '@/shared/contracts/users';
import { jsonResult, type HttpResult } from '@/backend/transport/http-result';

export async function listAdminUsers(query: {
  search?: string;
  limit?: number | string;
}): Promise<HttpResult> {
  return withAdminUser(
    async () => {
      const parsed = AdminUsersSearchSchema.safeParse(query);
      if (!parsed.success) {
        return jsonResult(400, { users: [], error: 'معايير البحث غير صالحة' });
      }
      const users = await createAdminUsersService().list(
        parsed.data.search ?? '',
        parsed.data.limit
      );
      return jsonResult(200, { users });
    },
    { whenFailed: { success: false, error: 'تعذر تحميل المستخدمين.' } }
  );
}
