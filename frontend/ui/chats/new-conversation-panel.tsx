'use client';

import { useState } from 'react';
import { X } from 'lucide-react';

import { createChatGroup } from '@/frontend/api/chats';
import { cn } from '@/frontend/shared/cn';
import { CHAT_GROUP_MEMBERS_MAX, type ChatPeer } from '@/shared/contracts/chat';
import { MemberPicker, type MemberPickerCopy } from './member-picker';
import { CHAT_NEW_COPY } from './chat-new-copy';

/**
 * The floating action's panel: a direct thread or a named group (#934).
 *
 * Both modes start from the same member search, so the two flows cannot drift
 * apart. It is its own component because it is a ported pair: the app draws the
 * same panel from `chat-new.json`, and `check:parity` holds the two against each
 * other.
 *
 * The direct row does not write. It names the member, and the site's own
 * `/chats/new?to=<handle>` screen sends the request from its one button, so a
 * click in the picker never starts a conversation on the member's behalf. A
 * group is created on the click, then entered like any other thread.
 */
export function NewConversationPanel({
  mode,
  onMode,
  onPick,
  onCreated,
  onClose,
}: {
  mode: 'direct' | 'group';
  onMode: (mode: 'direct' | 'group') => void;
  onPick: (peer: ChatPeer) => void;
  onCreated: (conversationId: string) => void;
  onClose: () => void;
}) {
  const tabs: { mode: 'direct' | 'group'; label: string }[] = [
    { mode: 'direct', label: CHAT_NEW_COPY.typeDirect },
    { mode: 'group', label: CHAT_NEW_COPY.typeGroup },
  ];

  const pickerCopy: MemberPickerCopy = {
    searchPlaceholder: CHAT_NEW_COPY.searchPlaceholder,
    searchLabel: CHAT_NEW_COPY.searchLabel,
    closeSearch: CHAT_NEW_COPY.closeSearch,
    searching: CHAT_NEW_COPY.searching,
    noResults: CHAT_NEW_COPY.noResults,
    inGroup: CHAT_NEW_COPY.inGroup,
  };

  return (
    <div className="rounded-2xl border border-border/70 bg-card/60 p-3 shadow-xs">
      <div
        role="tablist"
        aria-label={CHAT_NEW_COPY.conversationType}
        className="mb-3 flex items-center gap-1"
      >
        {tabs.map((tab) => (
          <button
            key={tab.mode}
            type="button"
            role="tab"
            aria-selected={mode === tab.mode}
            onClick={() => onMode(tab.mode)}
            className={cn(
              'rounded-lg px-3 py-1 text-xs font-bold transition-safe',
              mode === tab.mode
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-accent'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {mode === 'direct' ? (
        <MemberPicker onPick={onPick} onClose={onClose} copy={pickerCopy} />
      ) : (
        <GroupForm onCreated={onCreated} onClose={onClose} pickerCopy={pickerCopy} />
      )}
    </div>
  );
}

/** A name and 1-31 members; the creator is the 32nd and never picked. */
function GroupForm({
  onCreated,
  onClose,
  pickerCopy,
}: {
  onCreated: (conversationId: string) => void;
  onClose: () => void;
  pickerCopy: MemberPickerCopy;
}) {
  const [title, setTitle] = useState('');
  const [selected, setSelected] = useState<ChatPeer[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function toggle(peer: ChatPeer) {
    setSelected((current) =>
      current.some((member) => member.id === peer.id)
        ? current.filter((member) => member.id !== peer.id)
        : [...current, peer]
    );
  }

  async function submit() {
    if (busy) return;

    if (!title.trim()) {
      setError(CHAT_NEW_COPY.groupNameRequired);
      return;
    }
    if (selected.length === 0) {
      setError(CHAT_NEW_COPY.groupMembersRequired);
      return;
    }
    // The contract's own ceiling, said before the write rather than left to the
    // server's 400: the sentence is the schema's, so both clients say it.
    if (selected.length > CHAT_GROUP_MEMBERS_MAX - 1) {
      setError(CHAT_NEW_COPY.tooManyMembers);
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const result = await createChatGroup(
        title.trim(),
        selected.map((member) => member.id)
      );
      if (result.conversationId) {
        onCreated(result.conversationId);
        return;
      }
      setError(result.error ?? CHAT_NEW_COPY.groupCreateFailed);
    } catch (cause) {
      setError(
        cause instanceof Error && cause.message ? cause.message : CHAT_NEW_COPY.groupCreateFailed
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <label htmlFor="chat-group-title" className="sr-only">
          {CHAT_NEW_COPY.groupName}
        </label>
        <input
          id="chat-group-title"
          name="chat-group-title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={80}
          autoComplete="off"
          spellCheck={false}
          placeholder={CHAT_NEW_COPY.groupName}
          aria-label={CHAT_NEW_COPY.groupName}
          className="min-w-0 flex-1 rounded-xl border border-border/70 bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground/60 focus-visible:ring-2 focus-visible:ring-primary/40"
        />
        <button
          type="button"
          onClick={onClose}
          aria-label={CHAT_NEW_COPY.closeSearch}
          className="rounded-lg p-1 text-muted-foreground/70 transition-safe hover:bg-accent hover:text-foreground"
        >
          <X size={16} />
        </button>
      </div>

      <MemberPicker multiple selected={selected} onToggle={toggle} copy={pickerCopy} />

      {selected.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label={CHAT_NEW_COPY.invitees}>
          {selected.map((member) => (
            <li
              key={member.id}
              className="flex max-w-56 items-center gap-1 rounded-lg bg-muted/60 px-2 py-1 text-[11px] text-foreground/80"
            >
              <span className="truncate">{member.name ?? member.username}</span>
              <button
                type="button"
                onClick={() => toggle(member)}
                aria-label={CHAT_NEW_COPY.removeInvitee.replace(
                  '{name}',
                  member.name ?? member.username
                )}
                className="shrink-0 rounded p-0.5 hover:text-destructive"
              >
                <X size={11} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {error && (
        <p role="alert" className="text-xs font-medium text-destructive">
          {error}
        </p>
      )}

      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] text-muted-foreground/70">
          {CHAT_NEW_COPY.groupLimit.replace('{count}', String(CHAT_GROUP_MEMBERS_MAX - 1))}
        </p>
        <button
          type="button"
          onClick={() => void submit()}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground transition-safe hover:bg-primary/90 disabled:opacity-50"
        >
          {busy ? CHAT_NEW_COPY.groupCreating : CHAT_NEW_COPY.groupCreate}
        </button>
      </div>
    </div>
  );
}
