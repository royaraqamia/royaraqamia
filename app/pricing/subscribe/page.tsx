import '../../marketing.css';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Lock } from 'lucide-react';

import { getOptionalUser } from '@/backend/middleware/auth-guard';
import { loadPlanCatalog } from '@/backend/loaders/plans';
import { createDefaultSubscriptionRequestService } from '@/backend/config/subscriptions';
import { geoCountry } from '@/backend/transport/geo';
import { GeoCountryProvider } from '@/frontend/ui/shared/geo-country';
import { SignInCta } from '@/frontend/ui/shared/sign-in-cta';
import { SubscribeFlow } from '@/frontend/ui/subscriptions/subscribe-flow';
import { SubscribePageHeading } from '@/frontend/ui/subscriptions/subscribe-page-heading';
import { SubscribePlanSummary } from '@/frontend/ui/subscriptions/subscribe-plan-summary';
import { itemCapOf, planPriceLabel } from '@/frontend/ui/plans/pricing-view';
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
 *
 * It also hands the platform's country to the form, so the phone picker opens on
 * the visitor's own country — the number is what the Admin uses to arrange
 * activation (ADR-0176). The read costs no cacheability: the account and the plan
 * already make this document per-request, which is why it is declared in
 * `DYNAMIC_BY_DESIGN`.
 */
export default async function SubscribePage() {
  const [{ user }, country] = await Promise.all([getOptionalUser(), geoCountry()]);

  return (
    <GeoCountryProvider value={country}>
      <main id="main-content" dir="rtl" className="mx-auto max-w-2xl px-4 pt-6 pb-16 md:pb-24">
        {user ? <MemberSubscribeForm userId={user.id} /> : <GuestPanel />}
      </main>
    </GeoCountryProvider>
  );
}

async function MemberSubscribeForm({ userId }: { userId: string }) {
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
        <SubscribePageHeading />
        <p className="mt-2 text-sm text-muted-foreground">
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

  const price = planPriceLabel(catalog.settings.priceCents, catalog.settings.currency);

  return (
    <SubscribeFlow
      defaultName=""
      accountId={userId}
      summary={
        <SubscribePlanSummary price={price} itemCap={itemCapOf(catalog, SUBSCRIPTION_PLAN)} />
      }
    />
  );
}

function GuestPanel() {
  return (
    <section className="flex flex-col items-center gap-3 rounded-3xl border border-border/60 bg-card/70 p-6 text-center sm:p-8">
      <SubscribePageHeading />
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
