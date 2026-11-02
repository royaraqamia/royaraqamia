'use client';

import { useState } from 'react';
import { Check, Search, X } from 'lucide-react';

import { searchChatMembers } from '@/frontend/api/chats';
import { cn } from '@/frontend/shared/cn';
import { MemberAvatar } from '@/frontend/ui/shared/member-avatar';
import type { ChatPeer } from '@/shared/contracts/chat';

/**
 * The one member search the chats surface offers: verified handles only, two
 * characters minimum.
 *
 * It is drawn twice — the "new chat" picker picks one member and opens their
 * thread, and the group flows pick several — so the search itself lives here
 * rather than being copied into each of them.
 */
export function MemberPicker({
  multiple = false,
  selected = [],
  excludeIds = [],
  onPick,
  onToggle,
  onClose,
}: {
  multiple?: boolean;
  selected?: ChatPeer[];
  /** Members already in the room: still found, but not offered again. */
  excludeIds?: string[];
  onPick?: (peer: ChatPeer) => void;
  onToggle?: (peer: ChatPeer) => void;
  onClose?: () => void;
}) {
  const [term, setTerm] = useState('');
  const [results, setResults] = useState<ChatPeer[]>([]);
  const [busy, setBusy] = useState(false);

  async function search(value: string) {
    setTerm(value);
    if (value.trim().length < 2) {
      setResults([]);
      return;
    }

    setBusy(true);
    try {
      setResults(await searchChatMembers(value));
    } catch {
      setResults([]);
    } finally {
      setBusy(false);
    }
  }

  const chosen = new Set(selected.map((peer) => peer.id));

  return (
    <div>
      <div className="flex items-center gap-2">
        <Search size={16} className="shrink-0 text-muted-foreground/70" />
        <input
          value={term}
          onChange={(event) => void search(event.target.value)}
          placeholder="ابحث باسم العضو أو معرِّفه"
          aria-label="البحث عن عضو"
          className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/60"
        />
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="إغلاق البحث"
            className="rounded-lg p-1 text-muted-foreground/70 transition-safe hover:bg-accent hover:text-foreground"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {busy && <p className="mt-2 text-xs text-muted-foreground/70">جاري البحث...</p>}

      {!busy && term.trim().length >= 2 && results.length === 0 && (
        <p className="mt-2 text-xs text-muted-foreground/70">لا نتائج</p>
      )}

      {results.length > 0 && (
        <ul className="mt-2 divide-y divide-border/40">
          {results.map((peer) => {
            const present = excludeIds.includes(peer.id);
            const picked = chosen.has(peer.id);

            return (
              <li key={peer.id}>
                <button
                  type="button"
                  disabled={present}
                  aria-pressed={multiple ? picked : undefined}
                  onClick={() => (multiple ? onToggle?.(peer) : onPick?.(peer))}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-xl px-2 py-2 text-start transition-safe',
                    'hover:bg-accent focus-visible:bg-accent focus-visible:outline-none',
                    'disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent'
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
                      {present ? 'في المجموعة' : `@${peer.username}`}
                    </span>
                  </span>
                  {multiple && !present && (
                    <span
                      aria-hidden
                      className={cn(
                        'inline-flex size-5 shrink-0 items-center justify-center rounded-md border',
                        picked
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border/70 text-transparent'
                      )}
                    >
                      <Check size={13} />
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
