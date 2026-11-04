import { Check } from 'lucide-react';

import { FreePlanCta, PaidPlanCta, PlanViewerProvider } from '@/frontend/ui/plans/plan-ctas';
import { SectionTitle, SectionTitleHighlight } from '@/frontend/ui/shared/section-title';
import { formatCount } from '@/frontend/shared/format';
import { PRO_SERVICE_DISCOUNT_PERCENT } from '@/shared/service-pricing';
import type { PlanCatalog } from '@/shared/contracts/plans';

const FREE = 'free' as const;
const PRO = 'pro' as const;

/**
 * MCP is the one cap the page states on its own line, so the "every service"
 * sentence leaves it out: its allowance is three numbers, not the plan's width.
 */
const MCP_KEY = 'mcp_connected_apps';

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

/**
 * The one number every owned-item cap shares — the value the "every service"
 * sentence prints.
 *
 * The sentence is only true while the catalogue's caps are uniform, which is how
 * `plan_limits` is seeded (5 free / 50 pro, MCP apart) and what
 * `pricing-view.test.tsx` pins. If a catalog row ever breaks that, the smallest
 * cap is printed: understating a limit is a stale sentence, overstating it is a
 * promise the database refuses. That rule is why the group cap had to move onto
 * the same step (`20261113200000_chat_groups_cap_five.sql`): a single 3 / 20 row
 * quietly became the number the page printed for every service.
 */
export function itemCapOf(catalog: PlanCatalog, plan: typeof FREE | typeof PRO): number {
  const caps = catalog.limits
    .filter((limit) => limit.key !== MCP_KEY)
    .map((limit) => (plan === PRO ? limit.proCap : limit.freeCap));

  return caps.length === 0 ? 0 : Math.min(...caps);
}

/** MCP's own line: one app is a singular, and its cap comes from the catalogue. */
function mcpLine(catalog: PlanCatalog, plan: typeof FREE | typeof PRO): string {
  const cap = capOf(catalog, MCP_KEY, plan);
  return cap === 1 ? 'تطبيق MCP واحد كحد أقصى.' : `حتَّى ${formatCount(cap)} تطبيقات MCP.`;
}

/**
 * The public pricing page. Every number comes from the plan catalog
 * (`plan_settings`, `plan_limits`, `usage_limits`), so the page cannot promise an
 * allowance the database does not enforce (ADR-0093).
 *
 * The card is deliberately two lines for the free plan and three for the paid
 * one: what the account can hold, MCP's own cap, and the service discount. The
 * counted actions (downloads, scans, surahs, the assistant) and the news quotas
 * are enforced by the same catalogue and stated where a member meets them — the
 * refusal that names what is left — rather than as nine bullets above the price.
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

            <ul className="mt-4 flex-1 space-y-2 text-sm text-muted-foreground">
              <PlanPoint>
                {formatCount(itemCapOf(catalog, FREE))} عناصر كحد أقصى من كل خدمة.
              </PlanPoint>
              <PlanPoint>{mcpLine(catalog, FREE)}</PlanPoint>
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

            <ul className="mt-4 flex-1 space-y-2 text-sm text-muted-foreground">
              <PlanPoint>حتَّى {formatCount(itemCapOf(catalog, PRO))} عنصر من كل خدمة.</PlanPoint>
              <PlanPoint>حتَّى {formatCount(capOf(catalog, MCP_KEY, PRO))} تطبيقات MCP.</PlanPoint>
              <PlanPoint>
                خصم {PRO_SERVICE_DISCOUNT_PERCENT}% على التَّدريب والاستشارات وبناء المشاريع
                والتَّعاقُد الشَّهري.
              </PlanPoint>
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
