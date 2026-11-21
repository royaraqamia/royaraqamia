'use client';

import * as React from 'react';

/**
 * A button that has been used up but is still part of the page.
 *
 * A native `disabled` button leaves the tab order: the moment a counter fills,
 * focus falls to `<body>` and a keyboard or switch user loses their place and
 * their focus ring (WCAG 2.4.7). `aria-disabled` keeps the button focusable and
 * lets an assistive technology read the state instead; the guarded handler
 * still stops the action at the stated count.
 *
 * `disabled` is deliberately not a prop here. A control that cannot be used at
 * all is a different case, and moving focus to somewhere that explains it is
 * that caller's job, not this one's (#1670).
 */
export interface CompletedControlProps extends Omit<
  React.ComponentPropsWithoutRef<'button'>,
  'disabled'
> {
  /** The action is spent (or not ready yet): announce it, but keep focus. */
  complete?: boolean;
}

export function CompletedControl({ complete = false, onClick, ...props }: CompletedControlProps) {
  return (
    <button
      {...props}
      type="button"
      aria-disabled={complete || undefined}
      onClick={(event) => {
        if (complete) return;
        onClick?.(event);
      }}
    />
  );
}
