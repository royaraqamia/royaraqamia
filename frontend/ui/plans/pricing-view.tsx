import { Check } from 'lucide-react';

import { FreePlanCta, PaidPlanCta, PlanViewerProvider } from '@/frontend/ui/plans/plan-ctas';
import { SectionTitle, SectionTitleHighlight } from '@/frontend/ui/shared/section-title';
import { formatCount } from '@/frontend/shared/format';
import { PRO_SERVICE_DISCOUNT_PERCENT } from '@/shared/service-pricing';
import type { PlanCatalog } from '@/shared/contracts/plans';

const FREE = 'free' as const;
const PRO = 'pro' as const;

function priceLabel(cents: number, currency: string): string {
  const amount = cents / 100;
  const formatted = amount.toLocaleString('en-US', {
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
  return currency === 'USD' ? `$${formatted}` : `${formatted} ${currency}`;
}

function capOf(catalog: PlanCatalog, key: string, plan: typeof FREE | typeof PRO): number {
  const limit = catalog.limits.find((entry) => entry.key === key);
  if (!limit) return 0;
  return plan === PRO ? limit.proCap : limit.freeCap;
}

function counterCapOf(
  catalog: PlanCatalog,
  key: string,
  plan: typeof FREE | typeof PRO | 'visitor'
): number {
  const limit = catalog.counters.find((entry) => entry.key === key);
  if (!limit) return 0;
  if (plan === 'visitor') return limit.visitorCap;
  return plan === PRO ? limit.proCap : limit.freeCap;
}

function quotaCapOf(
  catalog: PlanCatalog,
  key: string,
  plan: typeof FREE | typeof PRO | 'visitor'
): number {
  const quota = catalog.quotas.find((entry) => entry.key === key);
  if (!quota) return 0;
  if (plan === 'visitor') return quota.visitorCap;
  return plan === PRO ? quota.proCap : quota.freeCap;
}

/**
 * The public pricing page. Every number comes from the plan catalog
 * (`plan_settings`, `plan_limits`, `usage_limits`), so the page cannot promise an
 * allowance the database does not enforce (ADR-0093).
 *
 * Two kinds of allowance are stated apart, because they behave differently: an
 * owned-item cap frees a slot when the item is deleted, a counted action is a
 * number of times (never refilling for a download, resetting at Damascus
 * midnight for a digest, a scan or a surah).
 *
 * It is deliberately reachable without an account: the account row links here
 * for guests too, and the visitor allowance is stated where a visitor meets it —
 * in the product, when a create is refused — rather than as a third column.
 */
export function PricingView({ catalog }: { catalog: PlanCatalog }) {
  const { settings } = catalog;

  const subscribeMessage = `أريد الاشتراك في الخطَّة المدفوعة: ${priceLabel(
    settings.priceCents,
    settings.currency
  )} كل ${settings.durationDays} يومًا.`;

  return (
    <div className="space-y-10 pb-6 sm:space-y-12">
      <header className="text-center">
        <SectionTitle as="h1">
          <SectionTitleHighlight>خطط التَّسعير</SectionTitleHighlight>
        </SectionTitle>
      </header>

      <PlanViewerProvider>
        <section aria-label="الخطتان" className="grid gap-4 sm:grid-cols-2">
          {/* Free */}
          <div
            role="group"
            aria-label="الخطَّة المجانيَّة"
            className="flex flex-col rounded-3xl border border-border/60 bg-card/80 p-6"
          >
            <p className="flex items-baseline gap-1.5 text-3xl font-black tracking-tight">
              <SectionTitleHighlight>$0</SectionTitleHighlight>
            </p>

            <p className="mt-2 text-sm text-muted-foreground">
              <strong className="font-bold text-foreground">
                {formatCount(capOf(catalog, 'notes', FREE))}
              </strong>{' '}
              عناصر من كل نوع، و
              <strong className="font-bold text-foreground">
                {formatCount(counterCapOf(catalog, 'downloader.job.create', FREE))}
              </strong>{' '}
              تنزيلات.
            </p>

            <ul className="mt-4 flex-1 space-y-2 text-sm text-muted-foreground">
              <PlanPoint>
                حتى {formatCount(capOf(catalog, 'habits', FREE))} عادات، و
                {formatCount(capOf(catalog, 'expenses', FREE))} مصروفًا، و
                {formatCount(capOf(catalog, 'budgets', FREE))} ميزانيات، و
                {formatCount(capOf(catalog, 'notes', FREE))} ملاحظة.
              </PlanPoint>
              <PlanPoint>
                حتى {formatCount(capOf(catalog, 'short_links', FREE))} رابطًا مختصرًا، و
                {formatCount(capOf(catalog, 'quran_bookmarks', FREE))} علامة في القرآن.
              </PlanPoint>
              <PlanPoint>
                حتى {formatCount(capOf(catalog, 'community_published', FREE))} منشورًا في المجتمع، و
                {formatCount(capOf(catalog, 'community_drafts', FREE))} مسودّات.
              </PlanPoint>
              <PlanPoint>
                {formatCount(counterCapOf(catalog, 'downloader.job.create', FREE))} تنزيلات، لا
                تتجدَّد أبدًا.
              </PlanPoint>
              <PlanPoint>
                يوميًّا: {formatCount(counterCapOf(catalog, 'scanner.scan', FREE))} عمليات مسح، و
                {formatCount(counterCapOf(catalog, 'quran.surah.read', FREE))} سور.
              </PlanPoint>
              <PlanPoint>
                أخبار: {formatCount(quotaCapOf(catalog, 'news.story.cards', FREE))} بطاقات في
                الصفحة، و{formatCount(quotaCapOf(catalog, 'news.sources', FREE))} مصادر مختارة.
              </PlanPoint>
              <PlanPoint>
                حتى {formatCount(capOf(catalog, 'mcp_connected_apps', FREE))} تطبيق MCP متَّصل.
              </PlanPoint>
              <PlanPoint>
                قراءة غير محدودة: المجتمع، القرآن، أسعار الصرف، التحقُّق من الشَّهادات.
              </PlanPoint>
            </ul>

            <FreePlanCta />
          </div>

          {/* Paid */}
          <div
            role="group"
            aria-label="الخطَّة المدفوعة"
            className="relative flex flex-col rounded-3xl border border-primary/30 bg-linear-to-b from-primary/5 to-transparent p-6"
          >
            <span className="absolute -top-3 start-6 rounded-full border border-primary/30 bg-background px-3 py-1 text-[11px] font-bold text-primary">
              موصَى به لك
            </span>

            <p className="flex items-baseline gap-1.5 text-3xl font-black tracking-tight">
              <SectionTitleHighlight>
                {priceLabel(settings.priceCents, settings.currency)}
              </SectionTitleHighlight>
            </p>

            <p className="mt-2 text-sm text-muted-foreground">
              <strong className="font-bold text-foreground">
                {formatCount(capOf(catalog, 'notes', PRO))}
              </strong>{' '}
              عنصرًا من كل نوع، و
              <strong className="font-bold text-foreground">
                {formatCount(counterCapOf(catalog, 'downloader.job.create', PRO))}
              </strong>{' '}
              تنزيلًا.
            </p>

            <ul className="mt-4 flex-1 space-y-2 text-sm text-muted-foreground">
              <PlanPoint>
                حتى {formatCount(capOf(catalog, 'habits', PRO))} عادة، و
                {formatCount(capOf(catalog, 'expenses', PRO))} مصروفًا، و
                {formatCount(capOf(catalog, 'budgets', PRO))} ميزانيّة، و
                {formatCount(capOf(catalog, 'notes', PRO))} ملاحظة.
              </PlanPoint>
              <PlanPoint>
                حتى {formatCount(capOf(catalog, 'short_links', PRO))} رابطًا مختصرًا، و
                {formatCount(capOf(catalog, 'quran_bookmarks', PRO))} علامة في القرآن.
              </PlanPoint>
              <PlanPoint>
                حتى {formatCount(capOf(catalog, 'community_published', PRO))} منشورًا في المجتمع، و
                {formatCount(capOf(catalog, 'community_drafts', PRO))} مسودّة.
              </PlanPoint>
              <PlanPoint>
                {formatCount(counterCapOf(catalog, 'downloader.job.create', PRO))} تنزيلًا، لا
                يتجدَّد أبدًا.
              </PlanPoint>
              <PlanPoint>
                يوميًّا: {formatCount(counterCapOf(catalog, 'scanner.scan', PRO))} عملية مسح، و
                {formatCount(counterCapOf(catalog, 'quran.surah.read', PRO))} سورة.
              </PlanPoint>
              <PlanPoint>
                أخبار: {formatCount(quotaCapOf(catalog, 'news.story.cards', PRO))} بطاقة في الصفحة،
                و{formatCount(quotaCapOf(catalog, 'news.sources', PRO))} مصدرًا مختارًا.
              </PlanPoint>
              <PlanPoint>
                حتى {formatCount(capOf(catalog, 'mcp_connected_apps', PRO))} تطبيقات MCP متَّصلة.
              </PlanPoint>
              <PlanPoint>
                خصم {PRO_SERVICE_DISCOUNT_PERCENT}% على التَّدريب والاستشارات وبناء المشاريع
                والتَّعاقُد الشَّهري.
              </PlanPoint>
              <PlanPoint>دعم مباشر عبر واتساب.</PlanPoint>
            </ul>

            <PaidPlanCta message={subscribeMessage} />
          </div>
        </section>
      </PlanViewerProvider>
    </div>
  );
}

function PlanPoint({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
      <span>{children}</span>
    </li>
  );
}
