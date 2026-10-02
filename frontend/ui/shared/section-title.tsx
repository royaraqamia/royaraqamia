import type { ReactNode } from 'react';
import { cn } from '@/frontend/shared/cn';

/**
 * The single source of truth for section, page and card headings.
 *
 * Every surface used to hand-roll its own `<h2>` with its own size, weight,
 * leading and gradient — and they drifted. This component fixes the typography
 * (size, weight, tracking, leading) and the highlight mechanism; callers pick a
 * `size` for the context and a `tone` for the surface they sit on.
 */
export type SectionTitleSize = 'card' | 'section' | 'display';
export type SectionTitleTone = 'foreground' | 'inverse' | 'auth';

const SIZE_CLASSES: Record<SectionTitleSize, string> = {
  card: 'text-2xl sm:text-3xl font-extrabold tracking-tight',
  section: 'text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight leading-tight',
  display: 'text-3xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight leading-[1.15]',
};

const TONE_CLASSES: Record<SectionTitleTone, string> = {
  foreground: 'text-foreground',
  inverse: 'text-white',
  auth: 'font-sans text-zinc-900 dark:text-zinc-50',
};

/**
 * Mechanics for a gradient highlight.
 *
 * `inline-block` plus vertical padding gives the background box enough room to
 * cover Arabic ascenders and dots — without it, `bg-clip-text` slices their
 * tops off (the text is transparent, so anywhere the gradient box does not
 * reach renders invisible).
 */
const HIGHLIGHT_BASE = 'inline-block bg-clip-text py-[0.15em] text-transparent';

/** The site-wide gradient used when a caller does not supply its own. */
const HIGHLIGHT_GRADIENT = 'bg-linear-to-r from-violet-400 via-fuchsia-400 to-indigo-400';

export const SECTION_TITLE_HIGHLIGHT = `${HIGHLIGHT_BASE} ${HIGHLIGHT_GRADIENT}`;

interface SectionTitleProps {
  children: ReactNode;
  /** Heading level; defaults to `h2`. */
  as?: 'h1' | 'h2' | 'h3';
  size?: SectionTitleSize;
  tone?: SectionTitleTone;
  className?: string;
  id?: string;
}

export function SectionTitle({
  children,
  as: Tag = 'h2',
  size = 'section',
  tone = 'foreground',
  className,
  id,
}: SectionTitleProps) {
  return (
    <Tag id={id} className={cn(SIZE_CLASSES[size], TONE_CLASSES[tone], className)}>
      {children}
    </Tag>
  );
}

interface SectionTitleHighlightProps {
  children: ReactNode;
  /** A full gradient palette that replaces the default one (e.g. a product's brand). */
  className?: string;
}

export function SectionTitleHighlight({ children, className }: SectionTitleHighlightProps) {
  return <span className={cn(HIGHLIGHT_BASE, className ?? HIGHLIGHT_GRADIENT)}>{children}</span>;
}
