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
import { formatMoney } from '@/shared/currency';

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
  return ({ userId, month, categoryId }) => {
    void (async () => {
      try {
        const admin = getAdminSupabase();
        const monthCat = `${month}-${categoryId}`;

        const { data: settings } = await admin
          .from('user_settings')
          .select('currency')
          .eq('user_id', userId)
          .maybeSingle();
        const currency = settings ? (settings.currency as string) : null;

        const alerts: {
          title: string;
          body: string;
          metadata: Record<string, unknown>;
          keys: string[];
        }[] = [];

        const { data: overallRow } = await admin
          .from('budgets')
          .select('amount')
          .eq('user_id', userId)
          .eq('month', month)
          .is('category_id', null)
          .maybeSingle();
        if (overallRow) {
          const overallBudget = Number(overallRow.amount);
          const { data: overallRows } = await admin
            .from('expenses')
            .select('amount')
            .eq('user_id', userId)
            .gte('date', `${month}-01`)
            .lte('date', `${month}-${daysInMonth(month)}`);
          const overallTotal = (overallRows ?? []).reduce((s, r) => s + Number(r.amount), 0);
          if (overallTotal > overallBudget) {
            alerts.push({
              title: 'تجاوزت ميزانيتك الشهرية',
              body: `أنفقت ${formatMoney(overallTotal, currency)} من ميزانية ${formatMoney(
                overallBudget,
                currency
              )} لهذا الشهر.`,
              metadata: { month, total: overallTotal, budget: overallBudget },
              keys: [`spendtrack:alert:${userId}:${month}`],
            });
          }
        }

        const { data: categoryBudget } = await admin
          .from('budgets')
          .select('amount')
          .eq('user_id', userId)
          .eq('month', month)
          .eq('category_id', categoryId)
          .maybeSingle();
        if (categoryBudget) {
          const budget = Number(categoryBudget.amount);
          const { data: catRows } = await admin
            .from('expenses')
            .select('amount')
            .eq('user_id', userId)
            .eq('category_id', categoryId)
            .gte('date', `${month}-01`)
            .lte('date', `${month}-${daysInMonth(month)}`);
          const catTotal = (catRows ?? []).reduce((s, r) => s + Number(r.amount), 0);
          if (catTotal > budget) {
            alerts.push({
              title: 'تجاوزت ميزانية التصنيف',
              body: `أنفقت ${formatMoney(catTotal, currency)} من ميزانية ${formatMoney(
                budget,
                currency
              )} لذا التصنيف هذا الشهر.`,
              metadata: { month, category_id: categoryId, total: catTotal, budget },
              keys: [`spendtrack:alert:${userId}:${monthCat}`],
            });
          }
        }

        for (const alert of alerts) {
          const allowed = await checkRateLimit(alert.keys[0]!, 1, EXPENSE_ALERT_WINDOW_MS, {
            failClosed: false,
          });
          if (!allowed) continue;
          await notify({
            user_id: userId,
            type: 'expense_alert',
            title: alert.title,
            body: alert.body,
            metadata: alert.metadata,
          });
        }
      } catch (err) {
        logger.error('Failed to send expense alert', { userId, month, error: String(err) });
      }
    })();
  };
}
