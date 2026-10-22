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
 * The database is the source of truth for enforcement (ADR-0075) and the
 * migration seeds exactly these rows. This copy exists for one narrow case: the
 * public pricing page must still render its numbers during a database outage (or
 * a local build with no database at all). If the two drift, the seeded table
 * wins — a stale page is a copy problem, not a billing one.
 */
const CATALOG_FALLBACK: PlanCatalog = {
  settings: {
    priceCents: 1000,
    currency: 'USD',
    durationDays: 30,
    windowDays: 30,
    freeCredits: 100,
    proCredits: 10000,
    anonymousDailyCredits: 10,
  },
  limits: [
    { key: 'habits', label: 'العادات', freeCap: 5, proCap: 200, sortOrder: 10 },
    { key: 'expenses', label: 'المصروفات', freeCap: 100, proCap: 10000, sortOrder: 20 },
    { key: 'expense_categories', label: 'فئات المصروفات', freeCap: 10, proCap: 50, sortOrder: 30 },
    { key: 'budgets', label: 'الميزانيات', freeCap: 3, proCap: 30, sortOrder: 40 },
    { key: 'short_links', label: 'الروابط المختصرة', freeCap: 10, proCap: 1000, sortOrder: 50 },
    { key: 'community_drafts', label: 'مسودات المنشورات', freeCap: 5, proCap: 100, sortOrder: 60 },
    {
      key: 'community_published',
      label: 'المنشورات المنشورة',
      freeCap: 10,
      proCap: 1000,
      sortOrder: 70,
    },
    { key: 'community_tags', label: 'وسوم المنشورات', freeCap: 5, proCap: 50, sortOrder: 80 },
    { key: 'community_categories', label: 'فئات المنشورات', freeCap: 3, proCap: 30, sortOrder: 90 },
    { key: 'quran_bookmarks', label: 'علامات القرآن', freeCap: 20, proCap: 1000, sortOrder: 100 },
    {
      key: 'mcp_connected_apps',
      label: 'تطبيقات MCP المتصلة',
      freeCap: 1,
      proCap: 10,
      sortOrder: 110,
    },
  ],
  costs: [
    { actionKey: 'community.post.publish', label: 'نشر منشور', cost: 10, sortOrder: 10 },
    { actionKey: 'community.post.edit', label: 'تعديل منشور', cost: 1, sortOrder: 20 },
    { actionKey: 'community.post.duplicate', label: 'نسخ منشور', cost: 5, sortOrder: 30 },
    { actionKey: 'community.media.upload', label: 'رفع صورة لمنشور', cost: 2, sortOrder: 40 },
    { actionKey: 'linksnap.link.create', label: 'إنشاء رابط مختصر', cost: 1, sortOrder: 50 },
    { actionKey: 'downloader.job.create', label: 'طلب تنزيل وسائط', cost: 5, sortOrder: 60 },
    { actionKey: 'mcp.tool.write', label: 'استدعاء أداة كتابة MCP', cost: 1, sortOrder: 70 },
    { actionKey: 'consultation.booking.create', label: 'طلب استشارة', cost: 1, sortOrder: 80 },
    {
      actionKey: 'training.application.submit',
      label: 'طلب التحاق بتدريب',
      cost: 1,
      sortOrder: 90,
    },
    { actionKey: 'project_request.submit', label: 'طلب بناء مشروع', cost: 1, sortOrder: 100 },
    { actionKey: 'retainer.submit', label: 'طلب تعاقد شهري', cost: 1, sortOrder: 110 },
    { actionKey: 'scanner.scan', label: 'مسح رمز', cost: 1, sortOrder: 120 },
    { actionKey: 'quran.surah.read', label: 'قراءة سورة في اليوم', cost: 1, sortOrder: 130 },
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
      const [settings, limits, costs] = await Promise.all([
        repository.getSettings(),
        repository.listLimits(),
        repository.listActionCosts(),
      ]);

      return { settings, limits, costs };
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
