import { cn } from '@/frontend/shared/cn';
import { Reveal } from './Reveal';
import { LandingCta } from './LandingCta';
import {
  SectionTitle,
  SectionTitleHighlight,
  type SectionTitleTone,
} from '@/frontend/ui/shared/section-title';

interface BottomCTAProps {
  appPath: string;
  loginRedirect: string;
  sectionClassName: string;
  sectionAria?: { label?: string; labelledby?: string };
  decor?: React.ReactNode;
  containerClassName: string;
  card?: {
    className: string;
    innerDecor?: React.ReactNode;
  };
  contentMotion: { initialY: number; viewportMargin: string; duration: number };
  contentClassName: string;
  contentDecor?: React.ReactNode;
  headingId?: string;
  /** Spacing/layout only — the size, weight, tracking and leading come from SectionTitle. */
  headingClassName?: string;
  headingTone?: SectionTitleTone;
  headingPrefix: string;
  headingHighlight: string;
  /** Overrides the highlight gradient for a product's own palette. */
  headingHighlightClassName?: string;
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
  headingId,
  headingClassName,
  headingTone = 'foreground',
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
  const content = (
    <>
      {contentDecor}

      <SectionTitle id={headingId} tone={headingTone} className={headingClassName}>
        {headingPrefix}
        <SectionTitleHighlight className={headingHighlightClassName}>
          {headingHighlight}
        </SectionTitleHighlight>
      </SectionTitle>

      <p className={subtitleClassName}>{subtitle}</p>

      <div
        className={cn('', actionsClassName)}
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
