import { Reveal } from './Reveal';
import {
  SectionTitle,
  SectionTitleHighlight,
  type SectionTitleTone,
} from '@/frontend/ui/shared/section-title';

interface SectionHeadingProps {
  as?: 'div' | 'header';
  wrapperClassName: string;
  titleId?: string;
  /** Surface the title sits on; controls the text color. */
  titleTone?: SectionTitleTone;
  /** Spacing/layout only — the size, weight, tracking and leading come from SectionTitle. */
  titleClassName?: string;
  titlePrefix: string;
  titleHighlight: string;
  /** Overrides the highlight gradient for a product's own palette. */
  titleHighlightClassName?: string;
  subtitle: string;
  subtitleClassName: string;
  initialY?: number;
  viewportMargin?: string;
  duration?: number;
  useEase?: boolean;
}

export function SectionHeading({
  as = 'div',
  wrapperClassName,
  titleId,
  titleTone = 'foreground',
  titleClassName,
  titlePrefix,
  titleHighlight,
  titleHighlightClassName,
  subtitle,
  subtitleClassName,
}: SectionHeadingProps) {
  const Tag = as === 'header' ? 'header' : 'div';
  return (
    <Reveal as={Tag} variant="fade" className={wrapperClassName}>
      <SectionTitle id={titleId} tone={titleTone} className={titleClassName}>
        {titlePrefix}
        <SectionTitleHighlight className={titleHighlightClassName}>
          {titleHighlight}
        </SectionTitleHighlight>
      </SectionTitle>
      <p className={subtitleClassName}>{subtitle}</p>
    </Reveal>
  );
}
