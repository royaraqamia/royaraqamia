'use client';

import { createContext, useContext } from 'react';
import { cn } from '@/frontend/shared/cn';
import { useMyUsage } from '@/frontend/state/plans/use-my-plan';
import { useSession } from '@/frontend/state/session-provider';
import { subscriberPriceUsd } from '@/shared/service-pricing';

/**
 * Whether the reader is a paid subscriber, resolved once per page.
 *
 * A service price appears on a cached marketing page (the home page) and on
 * dynamic form pages. The forms already know the account on the server, so they
 * pass `initialIsPro` and the price is right in the first paint; the home page
 * cannot, because it is shared by every visitor, so it settles in the browser
 * on the same allowance read the plan cards use.
 *
 * A failed allowance read leaves the boolean false rather than guessing: the
 * page must never advertise a discount it cannot confirm.
 */
const ServiceDiscountContext = createContext(false);

export function ServiceDiscountProvider({
  children,
  initialIsPro,
}: {
  children: React.ReactNode;
  /** A server-resolved answer. Omit on a cached page; the browser resolves it. */
  initialIsPro?: boolean;
}) {
  const { user } = useSession();
  const resolveInBrowser = initialIsPro === undefined;
  const { state, loading } = useMyUsage(resolveInBrowser && Boolean(user));

  const isPro = resolveInBrowser
    ? !loading && state !== null && (state.unlimited || state.plan === 'pro')
    : Boolean(initialIsPro);

  return (
    <ServiceDiscountContext.Provider value={isPro}>{children}</ServiceDiscountContext.Provider>
  );
}

interface ProPriceProps {
  /** The advertised price, in USD. */
  amountUsd: number;
  /** Classes for the price the reader pays. */
  className?: string;
  /** Classes for the struck-through list price. */
  originalClassName?: string;
}

/**
 * A service price, discounted for a subscriber.
 *
 * It renders an inline group so a parent's baseline alignment survives, and it
 * leaves the type scale to the caller: the same component is a 5xl gradient
 * headline on the training card and a 2xl figure in a booking summary.
 */
export function ProPrice({ amountUsd, className, originalClassName }: ProPriceProps) {
  const isPro = useContext(ServiceDiscountContext);
  const listPrice = usdLabel(amountUsd);

  if (!isPro) {
    return (
      <span dir="ltr" className={className}>
        {listPrice}
      </span>
    );
  }

  return (
    <span className="inline-flex flex-wrap items-baseline gap-x-2 gap-y-1">
      <span dir="ltr" className={className}>
        {usdLabel(subscriberPriceUsd(amountUsd))}
      </span>
      <span className="sr-only">السِّعر الأصلي</span>
      <s dir="ltr" className={cn('line-through', originalClassName)}>
        {listPrice}
      </s>
    </span>
  );
}

function usdLabel(amount: number): string {
  return `$${amount.toLocaleString('en-US')}`;
}
