import type { ChatPreview } from '@/shared/contracts/chat';

/**
 * The empty chat screen one picker row opens: the member it is about, the one
 * sentence when the member could not be read or the request could not be sent,
 * and the two loads it can be waiting on.
 *
 * The read wrote the preview, the failure and the flag from inside the same
 * `try/finally`, and the request wrote the failure and its own flag — so the
 * four are one state here.
 */
export interface NewChatData {
  preview: ChatPreview | null;
  error: string | null;
  isLoading: boolean;
  isRequesting: boolean;
}

export type NewChatAction =
  /** Nothing to read: no handle in the URL, or no session yet. */
  | { type: 'readSkipped' }
  | { type: 'previewRead'; preview: ChatPreview }
  | { type: 'readFailed'; message: string }
  | { type: 'requestStarted' }
  | { type: 'requestFailed'; message: string }
  | { type: 'requestFinished' };

export function newChatInitialState(): NewChatData {
  return { preview: null, error: null, isLoading: true, isRequesting: false };
}

export function newChatReducer(state: NewChatData, action: NewChatAction): NewChatData {
  switch (action.type) {
    case 'readSkipped':
      return { ...state, isLoading: false };

    case 'previewRead':
      return { ...state, preview: action.preview, isLoading: false };

    case 'readFailed':
      return { ...state, error: action.message, isLoading: false };

    case 'requestStarted':
      return { ...state, isRequesting: true, error: null };

    case 'requestFailed':
      return { ...state, error: action.message };

    case 'requestFinished':
      return { ...state, isRequesting: false };
  }
}
