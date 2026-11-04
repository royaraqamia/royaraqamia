import '../../marketing.css';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Check, Lock } from 'lucide-react';

import { getOptionalUser } from '@/backend/middleware/auth-guard';
import { loadPlanCatalog } from '@/backend/loaders/plans';
import { createDefaultSubscriptionRequestService } from '@/backend/config/subscriptions';
import { SectionTitle, SectionTitleHighlight } from '@/frontend/ui/shared/section-title';
import { SignInCta } from '@/frontend/ui/shared/sign-in-cta';
import { SubscribeFlow } from '@/frontend/ui/subscriptions/subscribe-flow';
import { itemCapOf, planPriceLabel } from '@/frontend/ui/plans/pricing-view';
import { formatCount } from '@/frontend/shared/format';
import { PRO_SERVICE_DISCOUNT_PERCENT } from '@/shared/service-pricing';
import { SUBSCRIPTION_PLAN } from '@/shared/contracts/subscriptions';

export const metadata: Metadata = {
  title: 'الاشتراك في الخطَّة المدفوعة',
  description: 'أرسِل طلب اشتراكك في الخطَّة المدفوعة، ويُفعَّل بعد التَّواصل معك.',
  alternates: { canonical: '/pricing/subscribe' },
  // A form behind an account is not a landing page: the pricing page is.
  robots: { index: false, follow: true },
};

/**
 * «اشترِك الآن» — the page the paid pill opens.
 *
 * Account-gated: an Admin activates a plan on an account, so a request without
 * one could never be acted on, and a guest is sent to sign in and brought back.
 *
 * Three states, decided on the server: a guest sees the sign-in panel; a member
 * already on the paid plan sees where their plan lives; a member who already has
 * an open request sees its reference code instead of being asked twice.
 */
export default async function SubscribePage() {
  const { user } = await getOptionalUser();

  return (
    <main id="main-content" dir="rtl" className="mx-auto max-w-2xl px-4 pt-6 pb-16 md:pb-24">
      <header className="mb-8 text-center">
        <SectionTitle as="h1" size="card">
          <SectionTitleHighlight>الاشتراك في الخطَّة المدفوعة</SectionTitleHighlight>
        </SectionTitle>
      </header>

      {user ? <MemberSubscribeForm userId={user.id} email={user.email ?? ''} /> : <GuestPanel />}
    </main>
  );
}

async function MemberSubscribeForm({ userId, email }: { userId: string; email: string }) {
  const [catalog, requests] = await Promise.all([
    loadPlanCatalog(),
    createDefaultSubscriptionRequestService().listMine(userId),
  ]);

  const open = requests.find(
    (request) => request.status === 'new' || request.status === 'contacted'
  );

  if (open) {
    return (
      <section className="rounded-3xl border border-border/60 bg-card/70 p-6 text-center sm:p-8">
        <p className="text-sm text-muted-foreground">
          طلبك قيد المراجعة — سنتواصل معك لتفعيل الخطَّة.
        </p>
        <p dir="ltr" className="mt-3 font-mono text-lg font-bold tracking-wide text-foreground">
          {open.reference_code}
        </p>
        <Link
          href="/account/plan"
          className="mt-6 inline-flex rounded-xl border border-border/60 px-4 py-2 text-sm font-bold text-foreground transition-colors hover:border-primary/40"
        >
          حالة خطَّتي
        </Link>
      </section>
    );
  }

  const price = `${planPriceLabel(catalog.settings.priceCents, catalog.settings.currency)} كل ${catalog.settings.durationDays} يومًا`;

  return (
    <SubscribeFlow
      defaultName=""
      defaultEmail={email}
      summary={
        <section
          aria-label="تفاصيل الخطَّة المدفوعة"
          className="rounded-3xl border border-purple-500/20 bg-linear-to-b from-purple-500/5 to-transparent p-6 sm:p-8"
        >
          <p className="flex items-baseline gap-1.5 text-3xl font-black tracking-tight">
            <SectionTitleHighlight>{price}</SectionTitleHighlight>
          </p>

          <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
            <li className="flex items-start gap-2">
              <Check className="mt-1 size-4 shrink-0 text-primary" aria-hidden="true" />
              <span>
                حتَّى {formatCount(itemCapOf(catalog, SUBSCRIPTION_PLAN))} عنصر من كل خدمة.
              </span>
            </li>
            <li className="flex items-start gap-2">
              <Check className="mt-1 size-4 shrink-0 text-primary" aria-hidden="true" />
              <span>
                خصم {PRO_SERVICE_DISCOUNT_PERCENT}% على التَّدريب والاستشارات وبناء المشاريع
                والتَّعاقُد الشَّهري.
              </span>
            </li>
          </ul>
        </section>
      }
    />
  );
}

function GuestPanel() {
  return (
    <section className="flex flex-col items-center gap-3 rounded-3xl border border-border/60 bg-card/70 p-6 text-center sm:p-8">
      <div className="flex size-12 items-center justify-center rounded-full border border-border/40 bg-muted/60 text-muted-foreground/80 shadow-inner">
        <Lock size={20} aria-hidden="true" />
      </div>
      <p className="text-sm leading-7 text-muted-foreground">
        سجِّل الدُّخول أولًا — الاشتراك يُفعَّل على حسابك.
      </p>
      <SignInCta href="/auth/login?redirect=/pricing/subscribe">تسجيل الدُّخول</SignInCta>
    </section>
  );
}
