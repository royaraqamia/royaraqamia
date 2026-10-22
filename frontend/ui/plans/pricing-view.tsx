import { Check } from 'lucide-react';

import { FreePlanCta, PaidPlanCta, PlanViewerProvider } from '@/frontend/ui/plans/plan-ctas';
import { SectionTitle, SectionTitleHighlight } from '@/frontend/ui/shared/section-title';
import { formatCount } from '@/frontend/shared/format';
import type { PlanCatalog, UsageActionKey } from '@/shared/contracts/plans';

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

function actionsFor(catalog: PlanCatalog, credits: number, key: UsageActionKey): number {
  const cost = catalog.costs.find((entry) => entry.actionKey === key)?.cost ?? 1;
  return Math.floor(credits / cost);
}

/**
 * The public pricing page. Every number comes from the plan catalog
 * (`plan_settings`, `plan_limits`, `usage_action_costs`), so the page cannot
 * promise an allowance the database does not enforce (ADR-0075).
 *
 * It is deliberately reachable without an account: the account row links here
 * for guests too, and a visitor has an allowance of their own.
 */
export function PricingView({ catalog }: { catalog: PlanCatalog }) {
  const { settings } = catalog;
  const free = settings.freeCredits;
  const pro = settings.proCredits;

  const postsFree = actionsFor(catalog, free, 'community.post.publish');
  const linksFree = actionsFor(catalog, free, 'linksnap.link.create');
  const downloadsFree = actionsFor(catalog, free, 'downloader.job.create');

  const postsPro = actionsFor(catalog, pro, 'community.post.publish');
  const linksPro = actionsFor(catalog, pro, 'linksnap.link.create');

  const subscribeMessage = `أريد الاشتراك في الخطة المدفوعة: ${priceLabel(
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
            aria-label="الخطة المجانيَّة"
            className="flex flex-col rounded-3xl border border-border/60 bg-card/80 p-6"
          >
            <p className="flex items-baseline gap-1.5 text-3xl font-black tracking-tight">
              <SectionTitleHighlight>$0</SectionTitleHighlight>
            </p>

            <p className="mt-2 text-sm text-muted-foreground">
              <strong className="font-bold text-foreground">{formatCount(free)}</strong> رصيدًا كل{' '}
              {settings.windowDays} يومًا
            </p>

            <ul className="mt-4 flex-1 space-y-2 text-sm text-muted-foreground">
              <PlanPoint>
                حتى {formatCount(postsFree)} منشورات، أو {formatCount(linksFree)} رابطًا مختصرًا، أو{' '}
                {formatCount(downloadsFree)} تنزيلًا — كلُّها من الرصيد نفسه.
              </PlanPoint>
              <PlanPoint>
                حتى {formatCount(capOf(catalog, 'habits', FREE))} عادات، و
                {formatCount(capOf(catalog, 'short_links', FREE))} رابطًا محفوظًا.
              </PlanPoint>
              <PlanPoint>
                حتى {formatCount(capOf(catalog, 'community_published', FREE))} منشورًا في المجتمع، و
                {formatCount(capOf(catalog, 'quran_bookmarks', FREE))} علامة في القرآن.
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
            aria-label="الخطة المدفوعة"
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
              <strong className="font-bold text-foreground">{formatCount(pro)}</strong> رصيدًا كل{' '}
              {settings.windowDays} يومًا
            </p>

            <ul className="mt-4 flex-1 space-y-2 text-sm text-muted-foreground">
              <PlanPoint>
                حتى {formatCount(postsPro)} منشورًا، أو {formatCount(linksPro)} رابطًا مختصرًا، أو{' '}
                {formatCount(actionsFor(catalog, pro, 'downloader.job.create'))} تنزيلًا.
              </PlanPoint>
              <PlanPoint>
                حتى {formatCount(capOf(catalog, 'habits', PRO))} عادة، و
                {formatCount(capOf(catalog, 'short_links', PRO))} رابطًا محفوظًا.
              </PlanPoint>
              <PlanPoint>
                حتى {formatCount(capOf(catalog, 'community_published', PRO))} منشورًا في المجتمع، و
                {formatCount(capOf(catalog, 'quran_bookmarks', PRO))} علامة في القرآن.
              </PlanPoint>
              <PlanPoint>
                حتى {formatCount(capOf(catalog, 'mcp_connected_apps', PRO))} تطبيقات MCP متَّصلة.
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
