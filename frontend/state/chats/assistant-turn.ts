'use client';

import { useSyncExternalStore } from 'react';

import type { ChatAgentPhase } from '@/shared/contracts/chat';

/**
 * The assistant turns that are in flight, by conversation (ADR-0165, ADR-0173).
 *
 * A turn is a request the member started on the thread screen, and the answer
 * may still be arriving when they back out to the list. The promise already
 * outlives the component; this registry is what makes its state visible too, so
 * نور's row says what she is doing — «تكتب...», «تقرأ شهاداتك...» — instead of
 * looking idle. It is a module-level store because both screens are separate
 * routes with no shared provider, and the entry is the phase alone rather than a
 * copy of the answer: the list draws one sentence, never the text.
 */
let active: ReadonlyMap<string, ChatAgentPhase> = new Map();
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
  setAssistantPhase(conversationId, { kind: 'thinking' });
}

/** The frame that just arrived, as the one line the row draws. */
export function setAssistantPhase(conversationId: string, phase: ChatAgentPhase): void {
  active = new Map(active).set(conversationId, phase);
  emit();
}

export function endAssistantTurn(conversationId: string): void {
  // A proposal is the one phase that outlives the stream: the write is waiting
  // for the member, so the row must keep saying so until they answer it.
  if (active.get(conversationId)?.kind === 'proposal') return;
  clearAssistantTurn(conversationId);
}

/** The member answered the proposal: the "needs you" line is done. */
export function clearAssistantTurn(conversationId: string): void {
  if (!active.has(conversationId)) return;
  const next = new Map(active);
  next.delete(conversationId);
  active = next;
  emit();
}

/** What the assistant is doing in this conversation, as a subscription a row can render. */
export function useAssistantPhase(conversationId: string | null): ChatAgentPhase | null {
  return useSyncExternalStore(
    subscribe,
    () => (conversationId ? (active.get(conversationId) ?? null) : null),
    () => null
  );
}
