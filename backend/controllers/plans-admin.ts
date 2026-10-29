import { createUsageService } from '@/backend/config/plans';
import { PlanTargetNotFoundError } from '@/backend/services/plans/usage-service';
import { zodFieldErrors } from '@/backend/shared/zod-field-errors';
import { withAdminUser } from '@/backend/transport/admin-handler';
import { jsonResult, type HttpResult } from '@/backend/transport/http-result';
import { ActivatePlanSchema, AdminPlansQuerySchema } from '@/shared/contracts/plans';

/**
 * The Admin Console's plans page. Reading is one paginated RPC over
 * `public.users`; writing is a manual 30-day grant, because money moves
 * off-system and an operator is the one who confirms it arrived (ADR-0006,
 * ADR-0075).
 */
export async function listPlanUsers(query: {
  search?: string;
  page?: number | string;
  pageSize?: number | string;
}): Promise<HttpResult> {
  return withAdminUser(
    async () => {
      const parsed = AdminPlansQuerySchema.safeParse(query);
      if (!parsed.success) {
        return jsonResult(400, { success: false, error: 'معايير البحث غير صالحة' });
      }

      const service = createUsageService();
      const [page, settings, limits, counters] = await Promise.all([
        service.listUsers(parsed.data),
        service.getSettings(),
        service.listLimits(),
        service.listCounters(),
      ]);

      return jsonResult(200, { success: true, ...page, settings, limits, counters });
    },
    { whenFailed: { success: false, error: 'تعذّر تحميل قائمة الاشتراكات.' } }
  );
}

export async function activateUserPlan(body: unknown): Promise<HttpResult> {
  return withAdminUser(
    async (identity) => {
      const parsed = ActivatePlanSchema.safeParse(body);
      if (!parsed.success) {
        return jsonResult(400, {
          success: false,
          error: 'تحقّق من بيانات التفعيل.',
          fieldErrors: zodFieldErrors(parsed.error),
        });
      }

      const activation = await createUsageService().activate(parsed.data, identity.userId);
      return jsonResult(200, { success: true, activation });
    },
    {
      mapError: (error) =>
        error instanceof PlanTargetNotFoundError
          ? jsonResult(404, { success: false, error: error.message })
          : null,
      whenFailed: { success: false, error: 'تعذّر تفعيل الاشتراك.' },
    }
  );
}
