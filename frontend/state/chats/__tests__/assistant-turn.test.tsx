import { afterEach, describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';

import {
  beginAssistantTurn,
  clearAssistantTurn,
  endAssistantTurn,
  setAssistantPhase,
  useAssistantPhase,
} from '@/frontend/state/chats/assistant-turn';

/**
 * The registry is what lets the list draw نور's turn after the member leaves the
 * thread: a turn that begins on the thread screen is still visible one route
 * away, and it ends exactly once (ADR-0165, ADR-0173).
 */
describe('assistant turn registry', () => {
  afterEach(() => {
    clearAssistantTurn('a-1');
    clearAssistantTurn('a-2');
  });

  it('reports a turn that began, and stops reporting it when it ends', () => {
    const { result } = renderHook(() => useAssistantPhase('a-1'));
    expect(result.current).toBeNull();

    act(() => beginAssistantTurn('a-1'));
    expect(result.current).toEqual({ kind: 'thinking' });

    act(() => endAssistantTurn('a-1'));
    expect(result.current).toBeNull();
  });

  it('carries the frame that just arrived', () => {
    const { result } = renderHook(() => useAssistantPhase('a-1'));

    act(() => beginAssistantTurn('a-1'));
    act(() => setAssistantPhase('a-1', { kind: 'writing' }));
    expect(result.current).toEqual({ kind: 'writing' });

    act(() => setAssistantPhase('a-1', { kind: 'tool', label: 'تقرأ شهاداتك' }));
    expect(result.current).toEqual({ kind: 'tool', label: 'تقرأ شهاداتك' });
  });

  it('keeps a proposal after the turn ends, until the member answers it', () => {
    const { result } = renderHook(() => useAssistantPhase('a-1'));

    act(() => beginAssistantTurn('a-1'));
    act(() => setAssistantPhase('a-1', { kind: 'proposal' }));
    act(() => endAssistantTurn('a-1'));
    expect(result.current).toEqual({ kind: 'proposal' });

    act(() => clearAssistantTurn('a-1'));
    expect(result.current).toBeNull();
  });

  it('is null for a row that is not the assistant', () => {
    const { result } = renderHook(() => useAssistantPhase(null));
    expect(result.current).toBeNull();
  });

  it('keeps two conversations apart', () => {
    const first = renderHook(() => useAssistantPhase('a-1'));
    const second = renderHook(() => useAssistantPhase('a-2'));

    act(() => beginAssistantTurn('a-1'));
    expect(first.result.current).toEqual({ kind: 'thinking' });
    expect(second.result.current).toBeNull();
  });
});
