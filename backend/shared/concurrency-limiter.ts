/**
 * Bounds how many async tasks run at once.
 *
 * Used to keep a burst of inbound requests from spawning an unbounded number of
 * background fan-out jobs (notification inserts + web pushes) that would
 * otherwise all hammer Supabase and the push providers simultaneously. The gate
 * is created once per module and therefore spans requests within an instance.
 */
export function createConcurrencyLimiter(
  maxConcurrent: number
): <T>(task: () => Promise<T>) => Promise<T> {
  if (!Number.isInteger(maxConcurrent) || maxConcurrent < 1) {
    throw new RangeError('maxConcurrent must be a positive integer');
  }

  let active = 0;
  const waiters: Array<() => void> = [];

  return async function run<T>(task: () => Promise<T>): Promise<T> {
    if (active >= maxConcurrent) {
      await new Promise<void>((resolve) => waiters.push(resolve));
    }

    active += 1;
    try {
      return await task();
    } finally {
      active -= 1;
      waiters.shift()?.();
    }
  };
}
