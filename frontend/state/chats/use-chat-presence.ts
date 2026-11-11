'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import {
  joinChatPresenceReader,
  joinChatPresenceWriter,
  type ChatPresenceWriter,
} from '@/frontend/api/chats';
import {
  CHAT_RECORDING_HEARTBEAT_MS,
  CHAT_RECORDING_TIMEOUT_MS,
  CHAT_TYPING_THROTTLE_MS,
  CHAT_TYPING_TIMEOUT_MS,
  type ChatPresenceState,
} from '@/shared/contracts/chat';

export interface ChatPresenceHook {
  /** What the peer is doing right now, or `null` when they are idle. */
  peer: ChatPresenceState | null;
  /** A keystroke: broadcasts at once, then at most once per window. */
  noteTyping: () => void;
  /** The recorder opened or closed; a recording outranks typing while it runs. */
  noteRecording: (recording: boolean) => void;
  /** The draft was sent or emptied, so the peer's indicator goes now. */
  stopTyping: () => void;
}

/**
 * Who is writing, and who is recording, in one open thread (ADR-0165).
 *
 * Two subscriptions, not one per conversation:
 *
 * - the reader joins the member's **own** `presence:` topic and keeps only the
 *   events that name this thread and its counterpart;
 * - the writer joins the **peer's** topic, which the insert policy admits and
 *   the peer's select policy does not, so it publishes without eavesdropping.
 *
 * Nothing is stored: the reader forgets each state on its window (five seconds
 * for typing, six for a recording, whose heartbeats are four apart), so a
 * closed tab or a dropped stop cannot pin an indicator on screen. A recording
 * outranks typing because a member holding the microphone is not writing.
 */
export function useChatPresence(
  conversationId: string,
  selfId: string | null,
  peerId: string | null
): ChatPresenceHook {
  const [peer, setPeer] = useState<ChatPresenceState | null>(null);
  const writerRef = useRef<ChatPresenceWriter | null>(null);
  const lastSentRef = useRef(0);
  const recordingRef = useRef(false);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const expiryRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearExpiry = useCallback(() => {
    if (expiryRef.current !== null) {
      clearTimeout(expiryRef.current);
      expiryRef.current = null;
    }
  }, []);

  const stopHeartbeat = useCallback(() => {
    if (heartbeatRef.current !== null) {
      clearInterval(heartbeatRef.current);
      heartbeatRef.current = null;
    }
  }, []);

  // The member's own stream. One subscription per open thread; a thread the
  // member cannot write in has no peer to hear from, so nothing is joined.
  useEffect(() => {
    if (!selfId || !peerId) return;

    const reader = joinChatPresenceReader(selfId, (event) => {
      if (event.conversationId !== conversationId || event.userId !== peerId) return;

      clearExpiry();
      if (event.state === 'stop') {
        setPeer(null);
        return;
      }

      setPeer(event.state);
      expiryRef.current = setTimeout(
        () => {
          expiryRef.current = null;
          setPeer(null);
        },
        event.state === 'recording' ? CHAT_RECORDING_TIMEOUT_MS : CHAT_TYPING_TIMEOUT_MS
      );
    });

    return () => {
      reader.leave();
      clearExpiry();
      setPeer(null);
    };
  }, [clearExpiry, conversationId, peerId, selfId]);

  // The peer's stream, write-only. Leaving the thread is not a decision to
  // announce: the reader's window closes it, and the socket may already be gone.
  useEffect(() => {
    if (!selfId || !peerId) return;

    const writer = joinChatPresenceWriter(peerId, selfId);
    writerRef.current = writer;
    lastSentRef.current = 0;
    recordingRef.current = false;

    return () => {
      writer.leave();
      writerRef.current = null;
      recordingRef.current = false;
      stopHeartbeat();
    };
  }, [peerId, selfId, stopHeartbeat]);

  const noteTyping = useCallback(() => {
    if (recordingRef.current) return;
    const now = Date.now();
    if (now - lastSentRef.current < CHAT_TYPING_THROTTLE_MS) return;
    lastSentRef.current = now;
    writerRef.current?.announce(conversationId, 'typing');
  }, [conversationId]);

  const stopTyping = useCallback(() => {
    // A recording's own stop is what ends it; a sent draft is not a reason to
    // cut the recording announcement short.
    if (recordingRef.current) return;
    lastSentRef.current = 0;
    writerRef.current?.stop(conversationId);
  }, [conversationId]);

  const noteRecording = useCallback(
    (recording: boolean) => {
      recordingRef.current = recording;

      if (!recording) {
        stopHeartbeat();
        lastSentRef.current = 0;
        writerRef.current?.stop(conversationId);
        return;
      }

      lastSentRef.current = Date.now();
      writerRef.current?.announce(conversationId, 'recording');
      if (heartbeatRef.current === null) {
        heartbeatRef.current = setInterval(() => {
          writerRef.current?.announce(conversationId, 'recording');
        }, CHAT_RECORDING_HEARTBEAT_MS);
      }
    },
    [conversationId, stopHeartbeat]
  );

  return { peer, noteTyping, noteRecording, stopTyping };
}
