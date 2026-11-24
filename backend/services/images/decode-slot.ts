/**
 * A process-wide ceiling on simultaneous image decodes (#1787).
 *
 * sharp hands a decode to libvips, which materialises the whole source before
 * it can resize. Two first hits for different variants of the same cover are
 * two allocations at once, and the free origin has one 512 MiB budget. This is
 * the same shape as `withDocumentSlot`: one decode runs, the rest queue.
 */

/** Decodes allowed at once. One, because the origin's memory is not shared. */
const IMAGE_DECODES_MAX = 1;

let activeDecodes = 0;
const waitingDecodes: Array<() => void> = [];
let peakDecodes = 0;

/**
 * Live and peak counts, for the tests that prove two callers cannot overlap.
 * `peak` is deliberately not reset: a past overlap stays visible.
 */
export function imageDecodeStats(): { active: number; waiting: number; peak: number } {
  return { active: activeDecodes, waiting: waitingDecodes.length, peak: peakDecodes };
}

/** Run a decode with the slot held, queuing when another decode is running. */
export async function withImageDecodeSlot<T>(work: () => Promise<T>): Promise<T> {
  if (activeDecodes >= IMAGE_DECODES_MAX) {
    await new Promise<void>((resolve) => waitingDecodes.push(resolve));
  } else {
    activeDecodes += 1;
    peakDecodes = Math.max(peakDecodes, activeDecodes);
  }

  try {
    return await work();
  } finally {
    const next = waitingDecodes.shift();
    if (next) next();
    else activeDecodes -= 1;
  }
}
