'use client';

import { joinChatPresenceChannel, type ChatPresenceChannel } from '@/frontend/api/chats';
import type { ChatPresenceEvent, ChatPresenceState } from '@/shared/contracts/chat';

/**
 * The presence topics one tab holds, keyed by conversation (ADR-0171).
 *
 * The topic is the conversation's, not the screen's. The chats list joins a
 * row's topic and the thread that row opens joins the same one, so a screen
 * that owned its channel would leave and rejoin one topic on the way in — a
 * cold join the member reads as a late indicator (#1332). One entry per
 * conversation is shared by every screen that wants it, and the last release
 * holds it for a grace window so a route change does not close it in the gap
 * between two screens (the same bound ADR-0169 gives the socket, one level up).
 */
export interface ChatPresenceHandle {
  /** Say the caller is writing or recording. The throttle is the caller's. */
  announce: (state: ChatPresenceState) => void;
  /** Say the state ended, so the indicator goes rather than waiting to expire. */
  stop: () => void;
  /** This caller is done; the topic stays joined while another still wants it. */
  release: () => void;
}

type PresenceListener = (event: ChatPresenceEvent) => void;

interface HeldChannel {
  channel: ChatPresenceChannel;
  /** The member the socket joined as; the topic's policy authorises that JWT. */
  selfId: string;
  listeners: Set<PresenceListener>;
  /** Set while the last caller is gone and the topic is waiting to be left. */
  closing: ReturnType<typeof setTimeout> | null;
}

/**
 * How long an unclaimed topic stays joined. Long enough for a member moving
 * from the list to a thread — two screens on one topic — and short enough that
 * a tab that left chat holds nothing for the rest of its life.
 */
export const CHAT_PRESENCE_CHANNEL_GRACE_MS = 60_000;

const held = new Map<string, HeldChannel>();

/**
 * The conversation's topic, joined if nobody holds it yet. Every caller after
 * the first shares the one channel and the one join.
 */
export function acquireChatPresence(
  conversationId: string,
  selfId: string,
  listener: PresenceListener
): ChatPresenceHandle {
  let entry = held.get(conversationId);

  // A different member is a different socket identity, so the old channel is
  // not theirs to keep: it was authorised by the JWT it joined with.
  if (entry && entry.selfId !== selfId) {
    close(conversationId);
    entry = undefined;
  }

  if (!entry) {
    const listeners = new Set<PresenceListener>();
    const channel = joinChatPresenceChannel(conversationId, selfId, (event) => {
      for (const one of [...listeners]) one(event);
    });
    entry = { channel, selfId, listeners, closing: null };
    held.set(conversationId, entry);
  }

  // A screen that comes back inside the window reclaims the join instead of
  // paying for a second one.
  if (entry.closing !== null) {
    clearTimeout(entry.closing);
    entry.closing = null;
  }

  const current = entry;
  const { listeners } = current;
  listeners.add(listener);

  let released = false;
  return {
    announce: current.channel.announce,
    stop: current.channel.stop,
    release: () => {
      if (released) return;
      released = true;
      listeners.delete(listener);
      if (listeners.size > 0) return;
      current.closing = setTimeout(() => {
        current.closing = null;
        if (held.get(conversationId) === current && current.listeners.size === 0) {
          close(conversationId);
        }
      }, CHAT_PRESENCE_CHANNEL_GRACE_MS);
    },
  };
}

/**
 * Signing out closes every topic the tab held, rather than leaving a joined
 * channel behind for the next member (ADR-0167). The grace window is for a
 * route change, not for an identity change.
 */
export function closeAllChatPresence(): void {
  for (const conversationId of [...held.keys()]) close(conversationId);
}

function close(conversationId: string): void {
  const entry = held.get(conversationId);
  if (!entry) return;
  if (entry.closing !== null) clearTimeout(entry.closing);
  entry.channel.leave();
  held.delete(conversationId);
}
