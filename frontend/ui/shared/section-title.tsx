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

/** The site-wide gradient used for the highlighted part of a title. */
export const SECTION_TITLE_HIGHLIGHT =
  'bg-linear-to-r from-violet-400 via-fuchsia-400 to-indigo-400 bg-clip-text text-transparent';

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
  /** Overrides the gradient when a surface needs a different palette. */
  className?: string;
}

export function SectionTitleHighlight({ children, className }: SectionTitleHighlightProps) {
  return <span className={cn(SECTION_TITLE_HIGHLIGHT, className)}>{children}</span>;
}
