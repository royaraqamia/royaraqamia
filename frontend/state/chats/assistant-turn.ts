'use client';

import { useSyncExternalStore } from 'react';

/**
 * The assistant turns that are in flight, by conversation (ADR-0165).
 *
 * A turn is a request the member started on the thread screen, and the answer
 * may still be arriving when they back out to the list. The promise already
 * outlives the component; this registry is what makes its state visible too, so
 * نور's row says «نور تكتب...» while the answer is being written instead of
 * looking idle. It is a module-level store because both screens are separate
 * routes with no shared provider, and the entry is a count of live turns rather
 * than a copy of the answer: the list draws one sentence, never the text.
 */
let active: ReadonlySet<string> = new Set();
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function beginAssistantTurn(conversationId: string): void {
  if (active.has(conversationId)) return;
  active = new Set(active).add(conversationId);
  emit();
}

export function endAssistantTurn(conversationId: string): void {
  if (!active.has(conversationId)) return;
  const next = new Set(active);
  next.delete(conversationId);
  active = next;
  emit();
}

/** Whether a turn is running, as a subscription a row can render from. */
export function useAssistantTurnActive(conversationId: string | null): boolean {
  return useSyncExternalStore(
    subscribe,
    () => (conversationId ? active.has(conversationId) : false),
    () => false
  );
}
