import type { Session, User } from '@supabase/supabase-js';
import type { MeResponse } from '@/shared/contracts/users';
import type { AssistantIdentity, AssistantVoice } from '@/shared/contracts/assistant-identity';

/**
 * The session, the profile it resolves, and the assistant's identity (ADR-0229).
 *
 * The boot wrote the session, the user and the loading flag together; the
 * profile read wrote the admin flag and four profile fields together; the
 * assistant read wrote its name, face and voice together; and clearing wrote the
 * same groups back. The provider only ever renders these values, so each group
 * is one transition.
 */
export interface SessionState {
  session: Session | null;
  user: User | null;
  isLoading: boolean;
  isAdmin: boolean;
  profileName: string | null;
  profileAvatarUrl: string | null;
  profileUsername: string | null;
  profileBio: string | null;
  /** The member's name for their assistant, or null before the read answers. */
  assistantName: string | null;
  /** How the assistant is addressed; the shipped default until the read answers. */
  assistantVoice: AssistantVoice;
  assistantAvatarUrl: string | null;
}

export type SessionAction =
  | { type: 'sessionAbsent' }
  | { type: 'resolved'; session: Session | null }
  | { type: 'loadFailed' }
  | { type: 'profileLoaded'; profile: MeResponse }
  | { type: 'profileCleared' }
  | { type: 'assistantLoaded'; identity: AssistantIdentity }
  | { type: 'assistantCleared' };

export function sessionInitialState(): SessionState {
  return {
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
  };
}

export function sessionReducer(state: SessionState, action: SessionAction): SessionState {
  switch (action.type) {
    // No cookie: there is nothing to check, so the boot identity is the answer.
    case 'sessionAbsent':
      return { ...state, isLoading: false };

    case 'resolved':
      return {
        ...state,
        session: action.session,
        user: action.session?.user ?? null,
        isLoading: false,
      };

    // A check that could not answer is not a sign-out, and must stop reporting
    // "still loading"; the session values stay as they were.
    case 'loadFailed':
      return { ...state, isLoading: false };

    case 'profileLoaded':
      return {
        ...state,
        isAdmin: action.profile.isAdmin,
        profileName: action.profile.name ?? null,
        profileAvatarUrl: action.profile.avatarUrl ?? null,
        profileUsername: action.profile.username ?? null,
        profileBio: action.profile.bio ?? null,
      };

    case 'profileCleared':
      return {
        ...state,
        isAdmin: false,
        profileName: null,
        profileAvatarUrl: null,
        profileUsername: null,
        profileBio: null,
      };

    // The resolved name, not the custom one: every surface paints a string and
    // never branches on whether the member renamed their copy.
    case 'assistantLoaded':
      return {
        ...state,
        assistantName: action.identity.name,
        assistantVoice: action.identity.voice,
        assistantAvatarUrl: action.identity.avatarUrl,
      };

    case 'assistantCleared':
      return {
        ...state,
        assistantName: null,
        assistantVoice: 'feminine',
        assistantAvatarUrl: null,
      };
  }
}
