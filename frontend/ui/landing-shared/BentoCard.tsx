'use client';

import { cloneElement, isValidElement, useEffect, useState } from 'react';
import { cn } from '@/frontend/shared/cn';
import { formatGradientAlpha } from './formatGradientAlpha';
import { useMouseSpotlight } from './useMouseSpotlight';

export interface SpotlightConfig {
  /** base color, e.g. 'rgba(139,92,246,1)' */
  rgba: string;
  /** alpha of the resting radial gradient (default 0.12) */
  backgroundAlpha?: number;
  /** alpha of the hover radial gradient (default 0.08) */
  hoverAlpha?: number;
  /** radius in px of the resting radial gradient (default 600) */
  backgroundRadius?: number;
  /** radius in px of the hover radial gradient (default 800) */
  hoverRadius?: number;
  /** fade endpoint (%) of the resting gradient (default 70) */
  backgroundFade?: number;
  /** fade endpoint (%) of the hover gradient (default 65) */
  hoverFade?: number;
  /** css background-color for the resting state (default hsl(var(--card, 240 10% 3.9%))) */
  backgroundColor?: string;
  /** use backgroundImage + backgroundColor instead of the background shorthand */
  useBackgroundImage?: boolean;
  /** extra layer appended after the resting gradient (e.g. a base tint) */
  backgroundLayer?: string;
}

interface BentoCardProps {
  title: string;
  description: string;
  icon: React.ReactNode;
  className?: string;
  delay?: number;
  as?: 'div' | 'article';
  initialY?: number;
  viewportMargin?: string;
  duration?: number;
  cardClassName: string;
  spotlight: SpotlightConfig;
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

const DEFAULT_RADIUS = 600;
const DEFAULT_RADIUS_HOVER = 800;
const DEFAULT_ALPHA = 0.12;
const DEFAULT_ALPHA_HOVER = 0.08;
const DEFAULT_FADE = 70;
const DEFAULT_FADE_HOVER = 65;
const DEFAULT_BACKGROUND_COLOR = 'hsl(var(--card, 240 10% 3.9%))';

function restingBackground(x: number, y: number, spot: SpotlightConfig): React.CSSProperties {
  const gradient = `radial-gradient(${spot.backgroundRadius ?? DEFAULT_RADIUS}px circle at ${x}% ${y}%, ${formatGradientAlpha(
    spot.rgba,
    spot.backgroundAlpha ?? DEFAULT_ALPHA
  )}, transparent ${spot.backgroundFade ?? DEFAULT_FADE}%)`;
  if (spot.useBackgroundImage) {
    return {
      backgroundImage: gradient,
      backgroundColor: spot.backgroundColor ?? DEFAULT_BACKGROUND_COLOR,
    };
  }
  if (spot.backgroundLayer) {
    return { background: `${gradient}, ${spot.backgroundLayer}` };
  }
  return {
    background: gradient,
    backgroundColor: spot.backgroundColor ?? DEFAULT_BACKGROUND_COLOR,
  };
}

function hoverBackground(x: number, y: number, spot: SpotlightConfig): React.CSSProperties {
  return {
    background: `radial-gradient(${spot.hoverRadius ?? DEFAULT_RADIUS_HOVER}px circle at ${x}% ${y}%, ${formatGradientAlpha(
      spot.rgba,
      spot.hoverAlpha ?? DEFAULT_ALPHA_HOVER
    )}, transparent ${spot.hoverFade ?? DEFAULT_FADE_HOVER}%)`,
  };
}

export function BentoCard({
  title,
  description,
  icon,
  className = '',
  delay = 0,
  as = 'div',
  initialY = 40,
  cardClassName,
  spotlight,
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
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') {
      setIsVisible(true);
      return;
    }
    const el = cardRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.1, rootMargin: '0px 0px -8% 0px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [cardRef]);

  const header = (
    <div className={headerClassName}>
      <div className={iconBoxClassName}>
        {isValidElement(icon)
          ? cloneElement(icon as React.ReactElement<{ size?: number; className?: string }>, {
              size: iconSize,
              className: cn(
                iconClassName,
                (icon as React.ReactElement<{ className?: string }>).props.className
              ),
            })
          : icon}
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
        <div
          className={hoverOverlayInnerClassName}
          style={hoverBackground(mousePos.x, mousePos.y, spotlight)}
        />
      </div>
    </>
  );

  const Tag: React.ElementType = as === 'article' ? 'article' : 'div';

  return (
    <Tag
      ref={cardRef as React.Ref<HTMLDivElement>}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className={cn('landing-reveal', isVisible && 'is-visible', cardClassName, className)}
      style={
        {
          ...restingBackground(mousePos.x, mousePos.y, spotlight),
          ['--ld' as string]: `${delay}s`,
          ['--landing-reveal-from' as string]: `translateY(${initialY}px)`,
        } as React.CSSProperties
      }
    >
      {content}
    </Tag>
  );
}
