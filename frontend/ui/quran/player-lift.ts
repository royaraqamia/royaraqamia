'use client';

import { useCallback, useEffect, useRef, type RefObject } from 'react';

/** The clear space every floating surface keeps from the thing it clears. */
const GAP = 12;

/** The two players, and the custom property each one publishes. */
export type PlayerLiftName = 'bar' | 'float';

/**
 * How far the Recitation reaches up from the viewport's bottom edge, published as
 * `--roy-player-<name>-lift` on `<html>` for as long as the player is mounted.
 *
 * `app/global.css` raises the corner floats and the bottom pills by it
 * (`--roy-float-rise`), and puts them back at rest when nothing is playing
 * (ADR-0087).
 *
 * Measured rather than written into the stylesheet: the mini bar's height is its
 * content's, the reader's float gains and loses a line as the status changes, and
 * a number in CSS would be a second copy of both that drifts from what it
 * describes.
 */
export function usePlayerLift<T extends HTMLElement>(name: PlayerLiftName): RefObject<T | null> {
  const ref = useRef<T>(null);

  const publish = useCallback(() => {
    const element = ref.current;
    if (!element) return;

    const top = element.getBoundingClientRect().top;
    const lift = Math.round(Math.max(window.innerHeight - top, 0) + GAP);
    document.documentElement.style.setProperty(`--roy-player-${name}-lift`, `${lift}px`);
  }, [name]);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    publish();

    // Its height follows a status line and its offset follows the classes the
    // route decides: a primary page's bar sits above the tab bar and a secondary
    // page's does not, which is a class change and not a resize. A breakpoint
    // moves it without either, so the viewport is watched too.
    const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(publish);
    resize?.observe(element);

    const attribute =
      typeof MutationObserver === 'undefined' ? null : new MutationObserver(publish);
    attribute?.observe(element, { attributes: true, attributeFilter: ['class'] });

    window.addEventListener('resize', publish);

    return () => {
      resize?.disconnect();
      attribute?.disconnect();
      window.removeEventListener('resize', publish);
      document.documentElement.style.removeProperty(`--roy-player-${name}-lift`);
    };
  }, [name, publish]);

  return ref;
}
