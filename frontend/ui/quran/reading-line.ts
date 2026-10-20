/**
 * Which ayah the reader is on.
 *
 * The Reading position is the ayah crossing a band near the top of the viewport
 * — the line being read — not the topmost visible ayah, which is usually the
 * tail of the one above. The band is expressed as a `rootMargin` because that is
 * the only way to give an IntersectionObserver a viewport region rather than an
 * element to intersect against.
 *
 * The observer reports only what *changed*, so the set of ayat currently inside
 * the band is kept here rather than inferred from one callback's entries.
 */

export interface AyahVisibility {
  ayah: number;
  isIntersecting: boolean;
}

/** Below the header, above mid-page: a band roughly where a line of sight lands. */
export const READING_LINE_ROOT_MARGIN = '-15% 0px -70% 0px';

/**
 * Returns a reducer over IntersectionObserver callbacks that reports the
 * lowest-numbered ayah inside the band, whenever there is one.
 */
export function createReadingLine(
  report: (ayah: number) => void
): (entries: readonly AyahVisibility[]) => void {
  const inBand = new Set<number>();

  return (entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) inBand.add(entry.ayah);
      else inBand.delete(entry.ayah);
    }

    let current: number | null = null;
    for (const ayah of inBand) {
      if (current === null || ayah < current) current = ayah;
    }
    if (current !== null) report(current);
  };
}

/**
 * Watches every ayah in `container` and reports the one at the reading line.
 * Returns the cleanup; a runtime without IntersectionObserver gets a no-op, so
 * reading is never something that depends on it.
 */
export function observeReadingLine(
  container: HTMLElement,
  report: (ayah: number) => void,
  Observer: typeof IntersectionObserver | undefined = globalThis.IntersectionObserver
): () => void {
  const ayat = container.querySelectorAll<HTMLElement>('[data-ayah]');
  if (typeof Observer !== 'function' || ayat.length === 0) return () => {};

  const handle = createReadingLine(report);
  const observer = new Observer(
    (entries) => {
      const visibility: AyahVisibility[] = [];
      for (const entry of entries) {
        const ayah = Number((entry.target as HTMLElement).dataset.ayah);
        if (Number.isFinite(ayah)) visibility.push({ ayah, isIntersecting: entry.isIntersecting });
      }
      handle(visibility);
    },
    { rootMargin: READING_LINE_ROOT_MARGIN, threshold: 0 }
  );

  ayat.forEach((node) => observer.observe(node));
  return () => observer.disconnect();
}

/** How long after the reader's own scroll playback leaves the page alone. */
export const READER_SCROLL_QUIET_MS = 1200;

/** True when the element is entirely outside the visible viewport. */
export function isOutsideViewport(
  rect: Pick<DOMRect, 'top' | 'bottom'>,
  viewportHeight: number
): boolean {
  return rect.bottom <= 0 || rect.top >= viewportHeight;
}
