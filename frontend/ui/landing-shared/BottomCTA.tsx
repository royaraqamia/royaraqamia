import { Sparkle } from 'lucide-react';
import { cn } from '@/frontend/shared/cn';
import { Reveal } from './Reveal';
import { LandingCta } from './LandingCta';

interface BottomCTAProps {
  appPath: string;
  loginRedirect: string;
  sectionClassName: string;
  sectionAria?: { label?: string; labelledby?: string };
  decor: React.ReactNode;
  containerClassName: string;
  card?: {
    className: string;
    innerDecor?: React.ReactNode;
  };
  contentMotion: { initialY: number; viewportMargin: string; duration: number };
  contentClassName: string;
  contentDecor?: React.ReactNode;
  badgeScale?: number;
  badgeMotionClassName: string;
  badgePillClassName?: string;
  badgeText: string;
  badgeSparkleClassName: string;
  headingId?: string;
  headingClassName: string;
  headingPrefix: string;
  headingHighlight: string;
  headingHighlightClassName: string;
  subtitle: string;
  subtitleClassName: string;
  actionsClassName: string;
  actionsMotion: { initialY: number; duration: number; useEase?: boolean };
  primaryButtonClassName: string;
  primaryButtonSpanClassName?: string;
  arrowClassName: string;
  secondaryButtonClassName: string;
}

export function BottomCTA({
  appPath,
  loginRedirect,
  sectionClassName,
  sectionAria,
  decor,
  containerClassName,
  card,
  contentClassName,
  contentDecor,
  badgeMotionClassName,
  badgePillClassName,
  badgeText,
  badgeSparkleClassName,
  headingId,
  headingClassName,
  headingPrefix,
  headingHighlight,
  headingHighlightClassName,
  subtitle,
  subtitleClassName,
  actionsClassName,
  primaryButtonClassName,
  primaryButtonSpanClassName,
  arrowClassName,
  secondaryButtonClassName,
}: BottomCTAProps) {
  const badge = (
    <div
      className={cn('landing-reveal-item', badgeMotionClassName)}
      style={{ ['--ld' as string]: '0.15s' } as React.CSSProperties}
    >
      {badgePillClassName ? (
        <div className={badgePillClassName}>
          <Sparkle size={16} fill="currentColor" className={badgeSparkleClassName} />
          <span>{badgeText}</span>
        </div>
      ) : (
        <>
          <Sparkle size={16} fill="currentColor" className={badgeSparkleClassName} />
          <span>{badgeText}</span>
        </>
      )}
    </div>
  );

  const content = (
    <>
      {contentDecor}
      {badge}

      <h2 id={headingId} className={headingClassName}>
        {headingPrefix}
        <span className={headingHighlightClassName}>{headingHighlight}</span>
      </h2>

      <p className={subtitleClassName}>{subtitle}</p>

      <div
        className={cn('landing-reveal-item', actionsClassName)}
        style={{ ['--ld' as string]: '0.3s' } as React.CSSProperties}
      >
        <LandingCta
          appPath={appPath}
          loginRedirect={loginRedirect}
          scrollTarget="how-it-works"
          primaryClassName={primaryButtonClassName}
          primarySpanClassName={primaryButtonSpanClassName}
          loggedOutLabel="أنشِئ حسابك"
          loggedInLabel="لوحة التَّحكُّم"
          arrowClassName={arrowClassName}
          secondaryClassName={secondaryButtonClassName}
          secondaryLabel="كيف يعمل"
        />
      </div>
    </>
  );

  return (
    <section
      className={sectionClassName}
      {...(sectionAria?.label ? { 'aria-label': sectionAria.label } : {})}
      {...(sectionAria?.labelledby ? { 'aria-labelledby': sectionAria.labelledby } : {})}
    >
      {decor}

      <div className={containerClassName}>
        {card ? (
          <div className={card.className}>
            {card.innerDecor}
            <Reveal className={contentClassName}>{content}</Reveal>
          </div>
        ) : (
          <Reveal className={contentClassName}>{content}</Reveal>
        )}
      </div>
    </section>
  );
}
