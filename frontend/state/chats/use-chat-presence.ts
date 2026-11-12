'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { joinChatPresenceChannel, type ChatPresenceChannel } from '@/frontend/api/chats';
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
 * Who is writing, and who is recording, in one open thread (ADR-0167).
 *
 * One subscription per conversation, carrying both halves: the member hears the
 * peer on `presence:<conversation id>` and says what they are doing through the
 * same join, because Realtime authorises a channel join against the `select`
 * policy and a write-only channel is not a shape it admits.
 *
 * Nothing is stored: the reader forgets each state on its window (five seconds
 * for typing, six for a recording, whose heartbeats are four apart), so a
 * closed tab or a dropped stop cannot pin an indicator on screen. A recording
 * outranks typing because a member holding the microphone is not writing.
 */
export function useChatPresence(conversationId: string, selfId: string | null): ChatPresenceHook {
  const [peer, setPeer] = useState<ChatPresenceState | null>(null);
  const channelRef = useRef<ChatPresenceChannel | null>(null);
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

  // The conversation's own stream. A thread the member cannot write in has no
  // peer to hear from, so nothing is joined.
  useEffect(() => {
    if (!selfId) return;

    lastSentRef.current = 0;
    recordingRef.current = false;

    const channel = joinChatPresenceChannel(conversationId, selfId, (event) => {
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
    channelRef.current = channel;

    return () => {
      channel.leave();
      channelRef.current = null;
      recordingRef.current = false;
      clearExpiry();
      stopHeartbeat();
      setPeer(null);
    };
  }, [clearExpiry, conversationId, selfId, stopHeartbeat]);

  const noteTyping = useCallback(() => {
    if (recordingRef.current) return;
    const now = Date.now();
    if (now - lastSentRef.current < CHAT_TYPING_THROTTLE_MS) return;
    lastSentRef.current = now;
    channelRef.current?.announce('typing');
  }, []);

  const stopTyping = useCallback(() => {
    // A recording's own stop is what ends it; a sent draft is not a reason to
    // cut the recording announcement short.
    if (recordingRef.current) return;
    lastSentRef.current = 0;
    channelRef.current?.stop();
  }, []);

  const noteRecording = useCallback(
    (recording: boolean) => {
      recordingRef.current = recording;

      if (!recording) {
        stopHeartbeat();
        lastSentRef.current = 0;
        channelRef.current?.stop();
        return;
      }

      lastSentRef.current = Date.now();
      channelRef.current?.announce('recording');
      if (heartbeatRef.current === null) {
        heartbeatRef.current = setInterval(() => {
          channelRef.current?.announce('recording');
        }, CHAT_RECORDING_HEARTBEAT_MS);
      }
    },
    [stopHeartbeat]
  );

  return { peer, noteTyping, noteRecording, stopTyping };
}
