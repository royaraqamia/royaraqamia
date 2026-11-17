import { Lock } from 'lucide-react';

import { cn } from '@/frontend/shared/cn';

import { SignInCta } from './sign-in-cta';

interface LockedCardProps {
  /** What the session unlocks, in one sentence. */
  title: string;
  /** The reason it is behind a session, when one line is not enough. */
  body?: string;
  /** The page a signed-in visitor lands on once the sign-in page answers. */
  href: string;
  /** The pill's own words; the Hero's «تسجيل الدُّخول» when absent. */
  ctaLabel?: string;
  /**
   * The visual gate's own name for the CTA (`shared/visual/<surface>.json`).
   * Optional, and only read by the recorder: no surface changes because of it.
   */
  visual?: string;
  className?: string;
}

/**
 * The site's locked state: the guest mark, the sentence that says what a
 * session unlocks, and the Hero's sign-in pill in a card.
 *
 * `plan-view` and `news-preferences` already answer a guest this way. The apps
 * surface used to answer with a bare sentence in one tab and a bare pill in the
 * other, so the same question read as two different products; both tabs draw
 * this card now (ADR-0098, ADR-0159).
 */
export function LockedCard({ title, body, href, ctaLabel, visual, className }: LockedCardProps) {
  return (
    <section className={cn('roy-card items-center text-center', className)}>
      <div className="roy-guest-mark">
        <Lock className="roy-glyph roy-glyph--md" aria-hidden="true" />
      </div>
      <div className="space-y-1">
        <p className="text-base font-bold text-foreground">{title}</p>
        {body && <p className="text-muted-foreground max-sm:text-xs sm:text-sm">{body}</p>}
      </div>
      <SignInCta href={href} className="mt-1 max-sm:w-full" visual={visual}>
        {ctaLabel}
      </SignInCta>
    </section>
  );
}
