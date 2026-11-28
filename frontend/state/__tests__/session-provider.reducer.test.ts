import { describe, expect, it } from 'vitest';
import type { Session } from '@supabase/supabase-js';
import type { MeResponse } from '@/shared/contracts/users';
import {
  sessionInitialState,
  sessionReducer,
  type SessionState,
} from '@/frontend/state/session-provider.reducer';

function session(userId: string): Session {
  return {
    access_token: 'token',
    refresh_token: 'refresh',
    expires_in: 3600,
    token_type: 'bearer',
    user: { id: userId, email: `${userId}@example.com` },
  } as unknown as Session;
}

function profile(patch: Partial<MeResponse> = {}): MeResponse {
  return {
    isAdmin: false,
    name: null,
    email: null,
    avatarUrl: null,
    username: null,
    bio: null,
    ...patch,
  };
}

function stateOf(patch: Partial<SessionState> = {}): SessionState {
  return { ...sessionInitialState(), ...patch };
}

describe('sessionInitialState', () => {
  it('starts loading with nobody signed in', () => {
    expect(sessionInitialState()).toEqual({
      session: null,
      user: null,
      isLoading: true,
      isAdmin: false,
      profileName: null,
      profileAvatarUrl: null,
      profileUsername: null,
      profileBio: null,
      assistantName: null,
      assistantVoice: 'feminine',
      assistantAvatarUrl: null,
    });
  });
});

describe('resolving the boot', () => {
  it('carries the session and the user in one transition', () => {
    const resolved = sessionReducer(stateOf(), { type: 'resolved', session: session('u-1') });

    expect(resolved.session?.user.id).toBe('u-1');
    expect(resolved.user?.id).toBe('u-1');
    expect(resolved.isLoading).toBe(false);
  });

  it('clears the user when the session is gone', () => {
    const previous = stateOf({
      session: session('u-1'),
      user: session('u-1').user,
      isLoading: true,
    });

    expect(sessionReducer(previous, { type: 'resolved', session: null })).toMatchObject({
      session: null,
      user: null,
      isLoading: false,
    });
  });

  it('stops waiting when no cookie was ever held', () => {
    expect(sessionReducer(stateOf(), { type: 'sessionAbsent' })).toMatchObject({
      isLoading: false,
      session: null,
    });
  });

  it('stops waiting without inventing a sign-out when the check failed', () => {
    const previous = stateOf({ session: session('u-2'), isLoading: true });

    expect(sessionReducer(previous, { type: 'loadFailed' })).toMatchObject({
      isLoading: false,
      session: session('u-2'),
    });
  });
});

describe('the profile read', () => {
  it('lands the admin flag and every profile field together', () => {
    const loaded = sessionReducer(stateOf(), {
      type: 'profileLoaded',
      profile: profile({
        isAdmin: true,
        name: 'أحمد',
        avatarUrl: 'https://example.com/a.png',
        username: 'ahmad',
        bio: 'كاتب',
      }),
    });

    expect(loaded).toMatchObject({
      isAdmin: true,
      profileName: 'أحمد',
      profileAvatarUrl: 'https://example.com/a.png',
      profileUsername: 'ahmad',
      profileBio: 'كاتب',
    });
  });

  it('clears the admin flag and the fields when nobody is signed in', () => {
    const previous = stateOf({
      isAdmin: true,
      profileName: 'أحمد',
      profileAvatarUrl: 'https://example.com/a.png',
      profileUsername: 'ahmad',
      profileBio: 'كاتب',
    });

    expect(sessionReducer(previous, { type: 'profileCleared' })).toMatchObject({
      isAdmin: false,
      profileName: null,
      profileAvatarUrl: null,
      profileUsername: null,
      profileBio: null,
    });
  });
});

describe('the assistant identity (ADR-0229)', () => {
  it('writes the resolved name, the voice and the face together', () => {
    const loaded = sessionReducer(stateOf(), {
      type: 'assistantLoaded',
      identity: {
        name: 'حكيم',
        customName: 'حكيم',
        avatarVariant: null,
        avatarUrl: 'https://example.com/assistant.png',
        voice: 'masculine',
        tone: 'default',
        note: null,
        updatedAt: null,
      },
    });

    expect(loaded).toMatchObject({
      assistantName: 'حكيم',
      assistantVoice: 'masculine',
      assistantAvatarUrl: 'https://example.com/assistant.png',
    });
  });

  it('goes back to the deployment defaults when the read answers nothing', () => {
    const previous = stateOf({
      assistantName: 'حكيم',
      assistantVoice: 'masculine',
      assistantAvatarUrl: 'https://example.com/assistant.png',
    });

    expect(sessionReducer(previous, { type: 'assistantCleared' })).toMatchObject({
      assistantName: null,
      assistantVoice: 'feminine',
      assistantAvatarUrl: null,
    });
  });
});
