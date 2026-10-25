import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import * as session from '@/frontend/state/session-provider';
import {
  GUEST_IDENTITY,
  clearPersistedIdentity,
  persistIdentity,
  userIdentity,
} from '@/frontend/shared/local-store/identity';
import { useLocalIdentity } from '@/frontend/state/use-local-identity';

vi.mock('@/frontend/state/session-provider', () => ({
  useSession: vi.fn(),
}));

const useSession = vi.mocked(session.useSession);

function sessionSays(user: { id: string } | null, isLoading = false) {
  // The real context carries a `Session` and profile fields; the hook reads the
  // user and the flag and nothing else.
  useSession.mockReturnValue({
    user,
    isLoading,
    session: null,
  } as unknown as ReturnType<typeof session.useSession>);
}

/**
 * The boot identity (#493): whose Local Store paints before the session
 * resolves, and what happens when the two disagree.
 */
describe('useLocalIdentity', () => {
  beforeEach(() => {
    window.localStorage.clear();
    useSession.mockReset();
  });

  it('paints the remembered account while the session is still unresolved', () => {
    persistIdentity(userIdentity('abc'));
    sessionSays(null, true);

    const { result } = renderHook(() => useLocalIdentity());

    expect(result.current.identity).toBe('user:abc');
    expect(result.current.isLoading).toBe(true);
    expect(result.current.sessionUserId).toBeNull();
  });

  it('does not move when the session agrees with it', () => {
    persistIdentity(userIdentity('abc'));
    sessionSays(null, true);

    const { result, rerender } = renderHook(() => useLocalIdentity());
    const before = result.current.identity;

    sessionSays({ id: 'abc' });
    rerender();

    // Same string, so a store effect keyed on `[identity]` never reopens.
    expect(result.current.identity).toBe(before);
    expect(result.current.sessionUserId).toBe('abc');
    expect(result.current.isUnconfirmed).toBe(false);
  });

  it('switches when a different account is actually signed in', () => {
    persistIdentity(userIdentity('abc'));
    sessionSays({ id: 'xyz' });

    const { result } = renderHook(() => useLocalIdentity());

    expect(result.current.identity).toBe('user:xyz');
  });

  it('keeps the remembered rows visible when the session answers "nobody"', () => {
    persistIdentity(userIdentity('abc'));
    sessionSays(null);

    const { result } = renderHook(() => useLocalIdentity());

    expect(result.current.identity).toBe('user:abc');
    expect(result.current.isUnconfirmed).toBe(true);
  });

  it('paints the guest namespace on a device that never resolved one', () => {
    sessionSays(null, true);

    const { result } = renderHook(() => useLocalIdentity());

    expect(result.current.identity).toBe(GUEST_IDENTITY);
    expect(result.current.isUnconfirmed).toBe(false);
  });

  it('follows a sign-out back to guest', () => {
    persistIdentity(userIdentity('abc'));
    sessionSays({ id: 'abc' });

    const { result } = renderHook(() => useLocalIdentity());
    expect(result.current.identity).toBe('user:abc');

    // A sign-out clears the pointer and navigates; the next mount is the one
    // that must not paint the account's rows.
    clearPersistedIdentity();
    sessionSays(null);

    expect(renderHook(() => useLocalIdentity()).result.current.identity).toBe(GUEST_IDENTITY);
  });
});
