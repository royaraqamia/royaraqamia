'use client';

import { LazyMotion, domAnimation, MotionConfig } from 'motion/react';

/**
 * The motion root, mounted by the routes that animate rather than by the layout
 * every route shares (#496).
 *
 * It used to wrap the whole app from `app/layout.tsx`, which put `motion` in the
 * initial graph of every surface — static marketing pages included, where nothing animates.
 * `m` throws outside a `LazyMotion`, so a route that renders one has to mount
 * this itself; the list is the grep, not a doc:
 * `grep -rl "from 'motion/react'" app frontend`.
 *
 * `reducedMotion="user"` travels with it on purpose. It is the single thing that
 * makes `m` honour the OS preference, and leaving it behind with the global
 * provider would trade a bundle win for an accessibility regression.
 */
export function MotionRoot({ children }: { children: React.ReactNode }) {
  return (
    <LazyMotion features={domAnimation}>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  );
}
