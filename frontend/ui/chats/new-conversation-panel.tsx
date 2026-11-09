'use client';

import { type ChatPeer } from '@/shared/contracts/chat';
import { MemberPicker, type MemberPickerCopy } from './member-picker';
import { CHAT_NEW_COPY } from './chat-new-copy';

/**
 * The floating action's panel: a direct thread.
 *
 * The direct row does not write. It names the member, and the site's own
 * `/chats/new?to=<handle>` screen sends the request from its one button, so a
 * click in the picker never starts a conversation on the member's behalf.
 */
export function NewConversationPanel({
  onPick,
  onClose,
}: {
  onPick: (peer: ChatPeer) => void;
  onClose: () => void;
}) {
  const pickerCopy: MemberPickerCopy = {
    searchPlaceholder: CHAT_NEW_COPY.searchPlaceholder,
    searchLabel: CHAT_NEW_COPY.searchLabel,
    closeSearch: CHAT_NEW_COPY.closeSearch,
    searching: CHAT_NEW_COPY.searching,
    noResults: CHAT_NEW_COPY.noResults,
  };

  return (
    <div className="rounded-2xl border border-border/70 bg-card/60 p-3 shadow-xs">
      <MemberPicker onPick={onPick} onClose={onClose} copy={pickerCopy} />
    </div>
  );
}
