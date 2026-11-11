import { afterEach, describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';

import {
  beginAssistantTurn,
  endAssistantTurn,
  useAssistantTurnActive,
} from '@/frontend/state/chats/assistant-turn';

/**
 * The registry is what lets the list draw نور's turn after the member leaves the
 * thread: a turn that begins on the thread screen is still visible one route
 * away, and it ends exactly once.
 */
describe('assistant turn registry', () => {
  afterEach(() => {
    endAssistantTurn('a-1');
    endAssistantTurn('a-2');
  });

  it('reports a turn that began, and stops reporting it when it ends', () => {
    const { result } = renderHook(() => useAssistantTurnActive('a-1'));
    expect(result.current).toBe(false);

    act(() => beginAssistantTurn('a-1'));
    expect(result.current).toBe(true);

    act(() => endAssistantTurn('a-1'));
    expect(result.current).toBe(false);
  });

  it('is false for a row that is not the assistant', () => {
    const { result } = renderHook(() => useAssistantTurnActive(null));
    expect(result.current).toBe(false);
  });

  it('keeps two conversations apart', () => {
    const first = renderHook(() => useAssistantTurnActive('a-1'));
    const second = renderHook(() => useAssistantTurnActive('a-2'));

    act(() => beginAssistantTurn('a-1'));
    expect(first.result.current).toBe(true);
    expect(second.result.current).toBe(false);
  });
});
