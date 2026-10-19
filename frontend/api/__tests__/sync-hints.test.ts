import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Handlers = Record<string, (payload: unknown) => void>;

interface SubscribedOnce {
  channel: string;
  table: string;
  filter?: string;
  handlers: Handlers;
}

const realtimeSubscriptions: SubscribedOnce[] = [];
const realtimeStops: string[] = [];

vi.mock('@/frontend/transport/supabase/realtime', () => ({
  subscribeToPostgresChanges: (options: SubscribedOnce) => {
    realtimeSubscriptions.push(options);
    return () => {
      realtimeStops.push(options.channel);
    };
  },
}));

import {
  HINT_DEBOUNCE_MS,
  subscribeToSyncHints,
  userSyncHints,
  type SyncHintSource,
} from '@/frontend/api/sync-hints';

const SOURCES = userSyncHints(['habits', 'habit_logs'], 'u-1');

let foreground = true;

function setForeground(next: boolean) {
  foreground = next;
  document.dispatchEvent(new Event('visibilitychange'));
}

/** Records the sources handed to the injected subscriber, and drives hints. */
function recordSubscriptions() {
  const hints: Array<() => void> = [];
  const stops: Array<ReturnType<typeof vi.fn>> = [];
  const subscribe = vi.fn((source: SyncHintSource, onHint: () => void) => {
    void source;
    hints.push(onHint);
    const stop = vi.fn();
    stops.push(stop);
    return stop;
  });
  return { subscribe, hints, stops };
}

beforeEach(() => {
  vi.useFakeTimers();
  foreground = true;
  realtimeSubscriptions.length = 0;
  realtimeStops.length = 0;
});

afterEach(() => {
  vi.useRealTimers();
});

describe('userSyncHints', () => {
  it('names one channel per table and scopes it to the account', () => {
    expect(userSyncHints(['habits', 'habit_logs'], 'u-1')).toEqual([
      { table: 'habits', channel: 'habits_sync_hints', filter: 'user_id=eq.u-1' },
      { table: 'habit_logs', channel: 'habit_logs_sync_hints', filter: 'user_id=eq.u-1' },
    ]);
  });
});

describe('subscribeToSyncHints', () => {
  it('subscribes to every source while the document is visible', () => {
    const { subscribe } = recordSubscriptions();
    const onHint = vi.fn();

    subscribeToSyncHints(SOURCES, onHint, { subscribe, isForeground: () => foreground });

    expect(subscribe).toHaveBeenCalledTimes(2);
    expect(subscribe).toHaveBeenCalledWith(SOURCES[0], expect.any(Function));
    // Subscribing is not a hint: the surface's own mount pull is already running.
    expect(onHint).not.toHaveBeenCalled();
  });

  it('holds no subscription while the document is hidden', () => {
    foreground = false;
    const { subscribe } = recordSubscriptions();

    subscribeToSyncHints(SOURCES, vi.fn(), { subscribe, isForeground: () => foreground });

    expect(subscribe).not.toHaveBeenCalled();

    setForeground(true);
    expect(subscribe).toHaveBeenCalledTimes(2);
  });

  it('drops the subscriptions when the document goes hidden', () => {
    const { subscribe, stops } = recordSubscriptions();

    subscribeToSyncHints(SOURCES, vi.fn(), { subscribe, isForeground: () => foreground });
    setForeground(false);

    expect(stops).toHaveLength(2);
    for (const stop of stops) expect(stop).toHaveBeenCalledTimes(1);
  });

  it('folds a burst of changes into one pull', async () => {
    const { subscribe, hints } = recordSubscriptions();
    const onHint = vi.fn();

    subscribeToSyncHints(SOURCES, onHint, { subscribe, isForeground: () => foreground });
    for (let change = 0; change < 5; change += 1) hints[0]!();

    await vi.advanceTimersByTimeAsync(HINT_DEBOUNCE_MS);
    expect(onHint).toHaveBeenCalledTimes(1);
  });

  it('pulls again for a later burst', async () => {
    const { subscribe, hints } = recordSubscriptions();
    const onHint = vi.fn();

    subscribeToSyncHints(SOURCES, onHint, { subscribe, isForeground: () => foreground });
    hints[0]!();
    await vi.advanceTimersByTimeAsync(HINT_DEBOUNCE_MS);
    await vi.advanceTimersByTimeAsync(HINT_DEBOUNCE_MS);
    hints[1]!();
    await vi.advanceTimersByTimeAsync(HINT_DEBOUNCE_MS);

    expect(onHint).toHaveBeenCalledTimes(2);
  });

  it('stops listening to visibility and drops a pending pull when unsubscribed', async () => {
    const { subscribe, hints, stops } = recordSubscriptions();
    const onHint = vi.fn();

    const unsubscribe = subscribeToSyncHints(SOURCES, onHint, {
      subscribe,
      isForeground: () => foreground,
    });
    hints[0]!();
    unsubscribe();

    expect(stops).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(HINT_DEBOUNCE_MS);
    expect(onHint).not.toHaveBeenCalled();

    // The visibility listener is gone too: a later switch must not resubscribe.
    setForeground(false);
    setForeground(true);
    expect(subscribe).toHaveBeenCalledTimes(2);
  });

  it('keeps the surface alive when a channel cannot be opened', () => {
    const { subscribe } = recordSubscriptions();

    expect(() =>
      subscribeToSyncHints(SOURCES, vi.fn(), {
        subscribe: (source, onHint) => {
          if (source.table === 'habits') throw new Error('no session');
          return subscribe(source, onHint);
        },
        isForeground: () => foreground,
      })
    ).not.toThrow();

    // The source that could be opened still is.
    expect(subscribe).toHaveBeenCalledTimes(1);
  });

  it('asks Realtime for each table, filtered to the account', async () => {
    const onHint = vi.fn();

    subscribeToSyncHints(SOURCES, onHint, { isForeground: () => foreground });

    expect(
      realtimeSubscriptions.map(({ channel, table, filter }) => ({ channel, table, filter }))
    ).toEqual([
      { channel: 'habits_sync_hints', table: 'habits', filter: 'user_id=eq.u-1' },
      { channel: 'habit_logs_sync_hints', table: 'habit_logs', filter: 'user_id=eq.u-1' },
    ]);

    // An insert, an update (a tombstone delete is one, ADR-0029) and a delete are
    // the same news: something moved, so pull.
    for (const event of ['onInsert', 'onUpdate', 'onDelete']) {
      realtimeSubscriptions[0]!.handlers[event]!({});
      await vi.advanceTimersByTimeAsync(HINT_DEBOUNCE_MS);
    }

    expect(onHint).toHaveBeenCalledTimes(3);
  });
});
