import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { throttle } from '@/frontend/shared/throttle';

describe('throttle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-02T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('executes the function immediately on the first call', () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 1000);

    throttled('a');

    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('a');
  });

  it('skips calls within the delay window but schedules a trailing execution', () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 1000);

    throttled('a');
    vi.advanceTimersByTime(100);
    throttled('b');
    vi.advanceTimersByTime(100);
    throttled('c');

    // Leading call fired, trailing scheduled with the latest args
    expect(fn).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(900);
    expect(fn).toHaveBeenCalledTimes(2);
    expect(fn).toHaveBeenLastCalledWith('c');
  });

  it('executes again when the delay has fully elapsed', () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 1000);

    throttled('a');
    vi.advanceTimersByTime(1000);
    throttled('b');

    expect(fn).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('passes through the latest arguments to the trailing call', () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 500);

    throttled('first');
    vi.advanceTimersByTime(100);
    throttled('second');
    vi.advanceTimersByTime(100);
    throttled('third');
    vi.advanceTimersByTime(500);

    expect(fn).toHaveBeenCalledTimes(2);
    expect(fn.mock.calls[0]).toEqual(['first']);
    expect(fn.mock.calls[1]).toEqual(['third']);
  });

  it('does not schedule trailing execution when no calls happen after the leading one', () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 1000);

    throttled('a');
    vi.advanceTimersByTime(2000);

    expect(fn).toHaveBeenCalledTimes(1);
  });
});
