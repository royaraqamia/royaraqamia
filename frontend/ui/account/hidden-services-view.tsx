'use client';

import { useState } from 'react';

import { HIDDEN_SERVICES_COPY } from './hidden-services-copy';

import { cn } from '@/frontend/shared/cn';
import { useHiddenServices } from '@/frontend/state/hidden-services-provider';
import { useSession } from '@/frontend/state/session-provider';
import { NeedsConnection } from '@/frontend/ui/shared/needs-connection';
import { SignInCta } from '@/frontend/ui/shared/sign-in-cta';
import { SERVICES_LINK } from '@/frontend/ui/navbar/services-link';
import { SERVICE_ROUTES, type HiddenServiceKey } from '@/shared/contracts/hidden-services';

/**
 * The account's hidden services (ADR-0112): every `خدماتنا` row with a switch.
 *
 * A switch that is on means "show it", because that is what the member is
 * looking at — a list of their services — and an off switch is the thing they
 * asked for. The write is the whole set, so a toggle recomputes the hidden routes
 * from the catalog in its own order and hands them over; the provider moves the
 * switch before the server answers and puts it back if the server refuses.
 *
 * Nothing here is a delete: the copy says so, because a member who reads "hide"
 * as "remove my notes" is one tap away from a wrong assumption.
 */
export function HiddenServicesView() {
  const { user, isLoading } = useSession();
  const { hidden, status, reload, save } = useHiddenServices();
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="space-y-2.5" aria-busy="true" aria-label={HIDDEN_SERVICES_COPY.loadingLabel}>
        <div className="h-16 rounded-2xl border border-border/40 bg-muted/40 animate-pulse" />
        <div className="h-16 rounded-2xl border border-border/40 bg-muted/40 animate-pulse" />
        <div className="h-16 rounded-2xl border border-border/40 bg-muted/40 animate-pulse" />
      </div>
    );
  }

  if (!user) {
    return (
      <SignInCta href="/auth/login?redirect=/account/services">
        {HIDDEN_SERVICES_COPY.signIn}
      </SignInCta>
    );
  }

  if (status === 'failed') {
    return <NeedsConnection message={HIDDEN_SERVICES_COPY.offline} onRetry={() => void reload()} />;
  }

  if (status === 'loading') {
    return (
      <div className="space-y-2.5" aria-busy="true" aria-label={HIDDEN_SERVICES_COPY.loadingLabel}>
        <div className="h-16 rounded-2xl border border-border/40 bg-muted/40 animate-pulse" />
        <div className="h-16 rounded-2xl border border-border/40 bg-muted/40 animate-pulse" />
        <div className="h-16 rounded-2xl border border-border/40 bg-muted/40 animate-pulse" />
      </div>
    );
  }

  const toggle = async (href: HiddenServiceKey) => {
    if (isSaving) return;

    setSaveError(null);
    setIsSaving(true);

    const next = SERVICE_ROUTES.filter((route) =>
      route === href ? !hidden.has(route) : hidden.has(route)
    );

    const failure = await save(next);
    setIsSaving(false);
    if (failure !== null) setSaveError(failure || HIDDEN_SERVICES_COPY.hideFailed);
  };

  const allHidden = SERVICE_ROUTES.every((route) => hidden.has(route));
  // The catalog's order, resolved against the menu the site ships: a route that
  // has left the menu has no row to draw, and the label is the menu's own. The
  // route (not the menu's `string`) is the row's key, so the switch hands the
  // contract's own type to the write.
  const rows = SERVICE_ROUTES.flatMap((route) => {
    const item = (SERVICES_LINK.subItems ?? []).find((candidate) => candidate.href === route);
    return item ? [{ ...item, href: route }] : [];
  });

  return (
    <div className="space-y-4">
      <p className="text-sm leading-7 text-muted-foreground">{HIDDEN_SERVICES_COPY.lede}</p>

      {saveError && (
        <p
          role="alert"
          className="rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm font-bold text-destructive"
        >
          {saveError}
        </p>
      )}

      <ul className="space-y-2.5">
        {rows.map((item) => {
          const isShown = !hidden.has(item.href);
          const Icon = item.icon;

          return (
            <li
              key={item.href}
              className="flex items-center justify-between gap-3 rounded-2xl border border-border/50 bg-card/60 px-4 py-3.5"
            >
              <div className="flex min-w-0 items-center gap-3">
                {Icon ? (
                  <Icon aria-hidden="true" className="h-4 w-4 shrink-0 text-primary" />
                ) : null}
                <div className="min-w-0 space-y-0.5">
                  <p className="truncate text-sm font-bold text-foreground sm:text-base">
                    {item.label}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {isShown ? HIDDEN_SERVICES_COPY.shown : HIDDEN_SERVICES_COPY.hidden}
                  </p>
                </div>
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={isShown}
                aria-label={(isShown
                  ? HIDDEN_SERVICES_COPY.hideAria
                  : HIDDEN_SERVICES_COPY.showAria
                ).replace('{name}', item.label)}
                disabled={isSaving}
                onClick={() => void toggle(item.href)}
                dir="ltr"
                className={cn(
                  'relative inline-flex h-7 w-12 shrink-0 cursor-pointer items-center rounded-full border px-1 transition-colors focus-ring disabled:opacity-60',
                  isShown
                    ? 'border-white/20 bg-linear-to-r from-purple-600 via-violet-600 to-indigo-600'
                    : 'border-border/70 bg-muted'
                )}
              >
                <span
                  className={cn(
                    'inline-block size-5 rounded-full bg-background shadow-sm transition-transform duration-200',
                    isShown ? 'translate-x-0' : 'translate-x-[18px]'
                  )}
                  aria-hidden="true"
                />
              </button>
            </li>
          );
        })}
      </ul>

      {allHidden && (
        <p className="rounded-2xl border border-primary/25 bg-primary/5 px-4 py-3 text-sm text-foreground">
          {HIDDEN_SERVICES_COPY.allHidden}
        </p>
      )}
    </div>
  );
}
