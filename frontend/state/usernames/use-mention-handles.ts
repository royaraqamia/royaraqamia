'use client';

import { useEffect, useMemo, useState } from 'react';

import { resolveMentionHandles } from '@/frontend/api/usernames';

/**
 * What the session has learned about handles (ADR-0192).
 *
 * Module scope on purpose: a chat thread mounts one bubble per message, and a
 * per-component cache would ask about the same handle once per bubble on every
 * re-render. A handle's existence does not change mid-session — a member cannot
 * be deleted and recreated under the same handle within a visit — so one answer
 * is enough for the whole tab.
 *
 * Both maps fail open: `false` is "not a link", which is the text the writer
 * typed, so an outage costs an underline and nothing else.
 */
const known = new Map<string, boolean>();
const inFlight = new Set<string>();

const BATCH = 50;

/** One read per batch, and the answer is remembered before the caller re-renders. */
function lookup(handles: string[]): Promise<void> {
  const missing = handles.filter((handle) => !known.has(handle) && !inFlight.has(handle));
  if (missing.length === 0) return Promise.resolve();

  for (const handle of missing) inFlight.add(handle);
  const batches: string[][] = [];
  for (let index = 0; index < missing.length; index += BATCH) {
    batches.push(missing.slice(index, index + BATCH));
  }

  return Promise.all(
    batches.map(async (batch) => {
      const found = new Set(await resolveMentionHandles(batch));
      for (const handle of batch) {
        known.set(handle, found.has(handle));
        inFlight.delete(handle);
      }
    })
  ).then(() => undefined);
}

/**
 * The handles among `handles` that are members, as the current render knows them.
 *
 * The first render answers from what is already known — often nothing — and the
 * answer arrives a moment later; the caller paints the text either way, so a
 * mention appears underlined rather than popping a line into place.
 */
export function useMentionHandles(handles: string[]): ReadonlySet<string> {
  const key = useMemo(() => [...new Set(handles)].sort().join(','), [handles]);
  const [answered, setAnswered] = useState(0);

  useEffect(() => {
    const wanted = key === '' ? [] : key.split(',');
    const unknown = wanted.filter((handle) => !known.has(handle));
    if (unknown.length === 0) return;

    let cancelled = false;
    void lookup(unknown).then(() => {
      if (!cancelled) setAnswered((value) => value + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [key]);

  return useMemo(() => {
    const wanted = key === '' ? [] : key.split(',');
    return new Set(wanted.filter((handle) => known.get(handle) === true));
    // `answered` is the render trigger: the map is module scope, so it is not a
    // dependency React could see change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, answered]);
}
