import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/backend/models/database.types';
import { createSpendtrackRepository } from '@/backend/repositories/spendtrack';
import {
  SpendtrackService,
  type ExpenseAlertInfo,
} from '@/backend/services/spendtrack/spendtrack-service';
import { getAdminSupabase } from '@/backend/config/supabase';
import { checkRateLimit } from '@/backend/config/rate-limiter';
import { createAdminNotificationProducer } from '@/backend/config/notifications';
import { logger } from '@/backend/shared/logger';

export function createSpendtrackService(supabase: SupabaseClient<Database>): SpendtrackService {
  return new SpendtrackService(createSpendtrackRepository(supabase), createExpenseAlertNotifier());
}

const EXPENSE_ALERT_WINDOW_MS = 45 * 24 * 60 * 60 * 1000;

function daysInMonth(month: string): number {
  const [year, mon] = month.split('-').map(Number);
  return new Date(year!, mon!, 0).getDate();
}

/**
 * Fire-and-forget: after an expense is created, if the user has a monthly
 * budget and the month's total (including the new expense) exceeds it, notify
 * them once per month. Fail-open and never blocks expense creation.
 */
export function createExpenseAlertNotifier(): (info: ExpenseAlertInfo) => void {
  const notify = createAdminNotificationProducer();
  return ({ userId, month }) => {
    void (async () => {
      try {
        const admin = getAdminSupabase();

        const { data: budgetRow } = await admin
          .from('budgets')
          .select('amount')
          .eq('user_id', userId)
          .eq('month', month)
          .maybeSingle();
        if (!budgetRow) return;
        const budget = Number(budgetRow.amount);

        const start = `${month}-01`;
        const end = `${month}-${daysInMonth(month)}`;
        const { data: expenseRows } = await admin
          .from('expenses')
          .select('amount')
          .eq('user_id', userId)
          .gte('date', start)
          .lte('date', end);
        const total = (expenseRows ?? []).reduce((sum, row) => sum + Number(row.amount), 0);

        if (total <= budget) return;

        const allowed = await checkRateLimit(
          `spendtrack:alert:${userId}:${month}`,
          1,
          EXPENSE_ALERT_WINDOW_MS,
          {
            failClosed: false,
          }
        );
        if (!allowed) return;

        await notify({
          user_id: userId,
          type: 'expense_alert',
          title: 'تجاوزت ميزانيتك الشهرية',
          body: `أنفقت ${total.toFixed(2)}$ من ميزانية ${budget.toFixed(2)}$ لهذا الشهر.`,
          metadata: { month, total, budget },
        });
      } catch (err) {
        logger.error('Failed to send expense alert', { userId, month, error: String(err) });
      }
    })();
  };
}
