'use client';

import { m, type MotionProps } from 'motion/react';
import type { ComponentType, ReactNode } from 'react';

/**
 * Minimal client motion island.
 *
 * Server Components render the surrounding static markup and pass it as
 * `children`; only this thin wrapper stays in the client bundle. All motion
 * behaviour (variants, easing, viewport trigger, stagger orchestration) is
 * forwarded verbatim, so sections converted to Server Components animate
 * exactly as before.
 */
const motionTags = ['div', 'p', 'a', 'article'] as const;
export type MotionTag = (typeof motionTags)[number];

type MotionRevealProps = MotionProps & {
  as?: MotionTag;
  children: ReactNode;
  className?: string;
  href?: string;
  target?: string;
  rel?: string;
  id?: string;
  'aria-label'?: string;
};

type RevealComponentProps = {
  children: ReactNode;
  className?: string;
  href?: string;
  target?: string;
  rel?: string;
  id?: string;
  'aria-label'?: string;
} & MotionProps;

export function MotionReveal({
  as = 'div',
  children,
  className,
  href,
  target,
  rel,
  id,
  'aria-label': ariaLabel,
  ...motionProps
}: MotionRevealProps) {
  const Component = (m[as] ?? m.div) as ComponentType<RevealComponentProps>;

  return (
    <Component
      className={className}
      href={href}
      target={target}
      rel={rel}
      id={id}
      aria-label={ariaLabel}
      {...motionProps}
    >
      {children}
    </Component>
  );
}
