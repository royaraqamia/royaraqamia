'use client';

import { useReducer } from 'react';
import { Search, X } from 'lucide-react';

import { searchChatMembers } from '@/frontend/api/chats';
import { cn } from '@/frontend/shared/cn';
import { MemberAvatar } from '@/frontend/ui/shared/member-avatar';
import type { ChatPeer } from '@/shared/contracts/chat';
import {
  isMemberSearchable,
  memberSearchInitialState,
  memberSearchReducer,
} from './member-picker.reducer';

/** The words the search draws, so a port can read them from one copy source. */
export interface MemberPickerCopy {
  searchPlaceholder: string;
  searchLabel: string;
  closeSearch: string;
  searching: string;
  noResults: string;
}

/**
 * The one member search the chats surface offers: verified handles only, two
 * characters minimum. It picks one member and opens their thread.
 *
 * [copy] lets the new-conversation panel pass the words from its own generated
 * source.
 */
export function MemberPicker({
  copy,
  onPick,
  onClose,
}: {
  copy: MemberPickerCopy;
  onPick?: (peer: ChatPeer) => void;
  onClose?: () => void;
}) {
  const [state, dispatch] = useReducer(memberSearchReducer, undefined, memberSearchInitialState);
  const { term, results, busy } = state;

  async function searchFor(value: string) {
    dispatch({ type: 'typed', term: value });
    if (!isMemberSearchable(value)) return;

    dispatch({ type: 'searchStarted' });
    try {
      dispatch({ type: 'searchSucceeded', results: await searchChatMembers(value) });
    } catch {
      dispatch({ type: 'searchFailed' });
    } finally {
      dispatch({ type: 'searchFinished' });
    }
  }

  return (
    <div>
      <div className="flex items-center gap-2">
        <Search size={16} className="shrink-0 text-muted-foreground/70" />
        <input
          name="chat-member-search"
          value={term}
          onChange={(event) => void searchFor(event.target.value)}
          placeholder={copy.searchPlaceholder}
          aria-label={copy.searchLabel}
          autoComplete="off"
          spellCheck={false}
          className="min-w-0 flex-1 rounded bg-transparent px-1 text-sm text-foreground outline-none placeholder:text-muted-foreground/60 focus-visible:ring-2 focus-visible:ring-primary/40"
        />
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label={copy.closeSearch}
            className="rounded-lg p-1 text-muted-foreground/70 transition-safe hover:bg-accent hover:text-foreground"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {busy && <p className="mt-2 text-xs text-muted-foreground/70">{copy.searching}</p>}

      {!busy && isMemberSearchable(term) && results.length === 0 && (
        <p className="mt-2 text-xs text-muted-foreground/70">{copy.noResults}</p>
      )}

      {results.length > 0 && (
        <ul className="mt-2 divide-y divide-border/40">
          {results.map((peer) => (
            <li key={peer.id}>
              <button
                type="button"
                onClick={() => onPick?.(peer)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-xl px-2 py-2 text-start transition-safe',
                  'hover:bg-accent focus-visible:bg-accent focus-visible:outline-none'
                )}
              >
                <MemberAvatar
                  name={peer.name ?? peer.username}
                  avatarUrl={peer.avatarUrl}
                  size="sm"
                  ring={false}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-foreground">
                    {peer.name ?? peer.username}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground/70">
                    @{peer.username}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
