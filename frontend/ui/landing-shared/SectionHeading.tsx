import { Reveal } from './Reveal';

interface SectionHeadingProps {
  badge?: React.ReactNode;
  as?: 'div' | 'header';
  wrapperClassName: string;
  titleId?: string;
  titleClassName: string;
  titlePrefix: string;
  titleHighlight: string;
  titleHighlightClassName: string;
  subtitle: string;
  subtitleClassName: string;
  initialY?: number;
  viewportMargin?: string;
  duration?: number;
  useEase?: boolean;
}

export function SectionHeading({
  badge,
  as = 'div',
  wrapperClassName,
  titleId,
  titleClassName,
  titlePrefix,
  titleHighlight,
  titleHighlightClassName,
  subtitle,
  subtitleClassName,
  initialY = 20,
}: SectionHeadingProps) {
  const Tag = as === 'header' ? 'header' : 'div';
  return (
    <Reveal
      as={Tag}
      variant="fade"
      className={wrapperClassName}
      style={
        {
          ['--landing-reveal-from' as string]: `translateY(${initialY}px)`,
        } as React.CSSProperties
      }
    >
      {badge}
      <h2 id={titleId} className={titleClassName}>
        {titlePrefix}
        <span className={titleHighlightClassName}>{titleHighlight}</span>
      </h2>
      <p className={subtitleClassName}>{subtitle}</p>
    </Reveal>
  );
}
