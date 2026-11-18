'use client';

import { LazyMotion, MotionConfig } from 'motion/react';

/**
 * The homepage's motion root for the two tabs that animate.
 *
 * The root stays in the initial graph so its children render on the first
 * frame; only `domAnimation` rides a separate chunk (from `motion-features`).
 * Wrapping the surface in `dynamic(..., { ssr: false })` would hide its content
 * until that chunk arrived — a paint win that was really a blank tab.
 */
const loadFeatures = () => import('./motion-features').then((module) => module.default);

export function HomeMotionRoot({ children }: { children: React.ReactNode }) {
  return (
    <LazyMotion features={loadFeatures}>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  );
}
