'use client';

import { motion } from 'motion/react';
import { useMouseSpotlight } from './useMouseSpotlight';

const ease: [number, number, number, number] = [0.16, 1, 0.3, 1];

interface BentoCardProps {
  title: string;
  description: string;
  icon: React.ElementType;
  className?: string;
  delay?: number;
  as?: 'div' | 'article';
  initialY?: number;
  viewportMargin?: string;
  duration?: number;
  cardClassName: string;
  backgroundStyle: (x: number, y: number) => React.CSSProperties;
  hoverStyle: (x: number, y: number) => React.CSSProperties;
  topDecor?: React.ReactNode;
  contentClassName: string;
  headerClassName: string;
  iconBoxClassName: string;
  iconClassName: string;
  iconSize?: number;
  titleClassName: string;
  titleWrapperClassName?: string;
  descriptionClassName: string;
  childrenWrapperClassName: string;
  hoverOverlayClassName: string;
  hoverOverlayInnerClassName?: string;
  flatContent?: boolean;
  children?: React.ReactNode;
}

export function BentoCard({
  title,
  description,
  icon: Icon,
  className = '',
  delay = 0,
  as = 'div',
  initialY = 40,
  viewportMargin = '-80px',
  duration = 0.7,
  cardClassName,
  backgroundStyle,
  hoverStyle,
  topDecor,
  contentClassName,
  headerClassName,
  iconBoxClassName,
  iconClassName,
  iconSize = 24,
  titleClassName,
  titleWrapperClassName,
  descriptionClassName,
  childrenWrapperClassName,
  hoverOverlayClassName,
  hoverOverlayInnerClassName = 'absolute inset-0',
  flatContent = false,
  children,
}: BentoCardProps) {
  const { cardRef, mousePos, handleMouseMove, handleMouseLeave } = useMouseSpotlight();

  const header = (
    <div className={headerClassName}>
      <div className={iconBoxClassName}>
        <Icon size={iconSize} className={iconClassName} />
      </div>
      {titleWrapperClassName !== undefined ? (
        <div className={titleWrapperClassName || undefined}>
          <h3 className={titleClassName}>{title}</h3>
        </div>
      ) : (
        <h3 className={titleClassName}>{title}</h3>
      )}
    </div>
  );

  const content = (
    <>
      {topDecor}
      <div className={contentClassName}>
        {flatContent ? (
          <>
            {header}
            <p className={descriptionClassName}>{description}</p>
            {children && <div className={childrenWrapperClassName}>{children}</div>}
          </>
        ) : (
          <>
            <div>
              {header}
              <p className={descriptionClassName}>{description}</p>
            </div>
            {children && <div className={childrenWrapperClassName}>{children}</div>}
          </>
        )}
      </div>
      <div className={hoverOverlayClassName}>
        <div className={hoverOverlayInnerClassName} style={hoverStyle(mousePos.x, mousePos.y)} />
      </div>
    </>
  );

  const baseProps = {
    initial: { opacity: 0, y: initialY },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true, margin: viewportMargin } as const,
    transition: { delay, duration, ease },
    onMouseMove: handleMouseMove,
    onMouseLeave: handleMouseLeave,
    className: `${cardClassName} ${className}`.trim(),
    style: backgroundStyle(mousePos.x, mousePos.y),
  };

  if (as === 'article') {
    return (
      <motion.article ref={cardRef} {...baseProps}>
        {content}
      </motion.article>
    );
  }
  return (
    <motion.div ref={cardRef} {...baseProps}>
      {content}
    </motion.div>
  );
}
