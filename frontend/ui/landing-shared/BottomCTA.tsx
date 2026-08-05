'use client';

import { motion } from 'motion/react';
import { ArrowLeft, Sparkle } from '@phosphor-icons/react';
import { Button } from '@/frontend/ui/primitives/button';
import { useLandingCta } from './useLandingCta';

const ease: [number, number, number, number] = [0.16, 1, 0.3, 1];
const spring: [number, number, number, number] = [0.34, 1.56, 0.64, 1];

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
  contentMotion,
  contentClassName,
  contentDecor,
  badgeScale = 0.9,
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
  actionsMotion,
  primaryButtonClassName,
  primaryButtonSpanClassName,
  arrowClassName,
  secondaryButtonClassName,
}: BottomCTAProps) {
  const { user, handleCTA, scrollToHowItWorks } = useLandingCta(appPath, loginRedirect);

  const badge = (
    <motion.div
      initial={{ scale: badgeScale, opacity: 0 }}
      whileInView={{ scale: 1, opacity: 1 }}
      viewport={{ once: true }}
      transition={{ delay: 0.15, duration: 0.5, ease: spring }}
      className={badgeMotionClassName}
    >
      {badgePillClassName ? (
        <div className={badgePillClassName}>
          <Sparkle size={16} weight="fill" className={badgeSparkleClassName} />
          <span>{badgeText}</span>
        </div>
      ) : (
        <>
          <Sparkle size={16} weight="fill" className={badgeSparkleClassName} />
          <span>{badgeText}</span>
        </>
      )}
    </motion.div>
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

      <motion.div
        initial={{ opacity: 0, y: actionsMotion.initialY }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={
          actionsMotion.useEase
            ? { delay: 0.3, duration: actionsMotion.duration, ease }
            : { delay: 0.3, duration: actionsMotion.duration }
        }
        className={actionsClassName}
      >
        <Button size="xl" onClick={handleCTA} className={primaryButtonClassName}>
          <span className={primaryButtonSpanClassName}>
            {user ? 'لوحة التَّحكُّم' : 'أنشِئ حسابك'}
          </span>
          <ArrowLeft size={20} weight="bold" className={arrowClassName} />
        </Button>

        <Button
          size="xl"
          variant="outline"
          onClick={scrollToHowItWorks}
          className={secondaryButtonClassName}
        >
          كيف يعمل
        </Button>
      </motion.div>
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
            <motion.div
              initial={{ opacity: 0, y: contentMotion.initialY }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: contentMotion.viewportMargin }}
              transition={{ duration: contentMotion.duration, ease }}
              className={contentClassName}
            >
              {content}
            </motion.div>
          </div>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: contentMotion.initialY }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: contentMotion.viewportMargin }}
            transition={{ duration: contentMotion.duration, ease }}
            className={contentClassName}
          >
            {content}
          </motion.div>
        )}
      </div>
    </section>
  );
}
