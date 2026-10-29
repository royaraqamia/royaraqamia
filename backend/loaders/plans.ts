import 'server-only';

import { unstable_cache } from 'next/cache';
import { getPublicSupabase } from '@/backend/config/supabase';
import { SupabaseUsageRepository } from '@/backend/repositories/plans/usage-repository';
import { logger } from '@/backend/shared/logger';
import type { PlanCatalog } from '@/shared/contracts/plans';

const PLAN_CATALOG_SECONDS = 300;

/**
 * The copy the pricing page falls back to when the catalog cannot be read.
 *
 * The database is the source of truth for enforcement (ADR-0093) and the
 * migration seeds exactly these rows. This copy exists for one narrow case: the
 * public pricing page must still render its numbers during a database outage (or
 * a local build with no database at all). If the two drift, the seeded tables
 * win — a stale page is a copy problem, not an entitlement one.
 */
const CATALOG_FALLBACK: PlanCatalog = {
  settings: {
    priceCents: 1000,
    currency: 'USD',
    durationDays: 30,
  },
  limits: [
    { key: 'habits', label: 'العادات', freeCap: 5, proCap: 50, sortOrder: 10 },
    { key: 'expenses', label: 'المصروفات', freeCap: 5, proCap: 50, sortOrder: 20 },
    { key: 'expense_categories', label: 'فئات المصروفات', freeCap: 5, proCap: 50, sortOrder: 30 },
    { key: 'budgets', label: 'الميزانيات', freeCap: 5, proCap: 50, sortOrder: 40 },
    { key: 'short_links', label: 'الروابط المختصرة', freeCap: 5, proCap: 50, sortOrder: 50 },
    { key: 'community_drafts', label: 'مسودات المنشورات', freeCap: 5, proCap: 50, sortOrder: 60 },
    {
      key: 'community_published',
      label: 'المنشورات المنشورة',
      freeCap: 5,
      proCap: 50,
      sortOrder: 70,
    },
    { key: 'community_tags', label: 'وسوم المنشورات', freeCap: 5, proCap: 50, sortOrder: 80 },
    { key: 'community_categories', label: 'فئات المنشورات', freeCap: 5, proCap: 50, sortOrder: 90 },
    { key: 'quran_bookmarks', label: 'علامات القرآن', freeCap: 5, proCap: 50, sortOrder: 100 },
    {
      key: 'mcp_connected_apps',
      label: 'تطبيقات MCP المتصلة',
      freeCap: 1,
      proCap: 10,
      sortOrder: 110,
    },
    { key: 'notes', label: 'الملاحظات', freeCap: 5, proCap: 50, sortOrder: 115 },
  ],
  counters: [
    {
      key: 'downloader.job.create',
      label: 'تنزيل وسائط',
      window: 'lifetime',
      visitorCap: 1,
      freeCap: 5,
      proCap: 50,
      sortOrder: 10,
    },
    {
      key: 'news.digest.open',
      label: 'فتح مُلخَّص أخبار',
      window: 'daily',
      visitorCap: 1,
      freeCap: 5,
      proCap: 50,
      sortOrder: 20,
    },
    {
      key: 'scanner.scan',
      label: 'مسح رمز',
      window: 'daily',
      visitorCap: 1,
      freeCap: 5,
      proCap: 50,
      sortOrder: 30,
    },
    {
      key: 'quran.surah.read',
      label: 'قراءة سورة في اليوم',
      window: 'daily',
      visitorCap: 1,
      freeCap: 5,
      proCap: 50,
      sortOrder: 40,
    },
  ],
};

/**
 * The public pricing catalog. Read on the anon client because the three catalog
 * tables are public reads; cached for five minutes so a page visit never pays
 * for three queries twice.
 */
export const loadPlanCatalog = unstable_cache(
  async (): Promise<PlanCatalog> => {
    try {
      const repository = new SupabaseUsageRepository(getPublicSupabase());
      const [settings, limits, counters] = await Promise.all([
        repository.getSettings(),
        repository.listLimits(),
        repository.listCounters(),
      ]);

      return { settings, limits, counters };
    } catch (error) {
      logger.warn('Plan catalog read failed; serving the fallback copy', {
        error: String(error),
      });
      return CATALOG_FALLBACK;
    }
  },
  ['plan-catalog'],
  { revalidate: PLAN_CATALOG_SECONDS }
);
