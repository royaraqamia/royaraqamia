'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Lock, Mic, Square, X } from 'lucide-react';

import { cn } from '@/frontend/shared/cn';
import { Button } from '@/frontend/ui/primitives/button';
import { useVoiceRecorder, VOICE_NOTE_MAX_MS } from '@/frontend/state/chats/use-voice-recorder';
import { formatVoiceDuration, VOICE_COPY } from './voice-copy';
import { ChatAttachButton, ChatStagedFiles } from './chat-attach-control';

/** How far a pressed pointer travels before the release counts as a cancel. */
const CANCEL_DISTANCE_PX = 64;
/** The bars the recording meter draws before the first reading arrives. */
const IDLE_LEVELS = 16;

/**
 * The composer's input row, shared by the member's thread and the assistant's
 * (ADR-0127).
 *
 * One field, and two controls: the paperclip sits *inside* the field at its end
 * edge, and the far end of the row is one slot that is a microphone while the
 * field is empty and a send button the moment there is something to send — the
 * row WhatsApp and Telegram trained everyone to expect, and the row that stops
 * the microphone from sitting beside a button nobody presses yet.
 * The parent supplies the words and the staged files; this file owns the
 * recording gesture, so the two threads cannot behave differently.
 *
 * Press and hold the microphone: a bar replaces the input, the timer and the
 * live waveform run, and the release sends. Slide away (or press the X) to
 * throw it away; press the lock to keep recording hands-free, then the
 * microphone ends and sends. Five minutes is the ceiling and a hold under a
 * second is a tap rather than a note — both from `shared/contracts/chat`.
 */
export function ChatComposer({
  value,
  onValueChange,
  onTyping,
  onSend,
  files,
  onAddFiles,
  onRemoveFile,
  onRecorded,
  disabled,
  placeholder,
  ariaLabel,
  sendLabel,
  sendIcon,
}: {
  value: string;
  onValueChange: (value: string) => void;
  /** A keystroke, for the member thread's typing channel. */
  onTyping?: () => void;
  onSend: () => void;
  files: File[];
  onAddFiles: (files: File[]) => void;
  onRemoveFile: (index: number) => void;
  /** A finished clip, already a WAV; the parent stages and sends it. */
  onRecorded: (file: File) => void;
  disabled: boolean;
  placeholder: string;
  ariaLabel: string;
  /** The send button's own name, which each thread words for itself. */
  sendLabel: string;
  /** The send glyph, named by the thread that draws the row (ADR-0100). */
  sendIcon: ReactNode;
}) {
  const recorder = useVoiceRecorder();
  const [locked, setLocked] = useState(false);
  const [pressing, setPressing] = useState(false);
  const origin = useRef<{ x: number; y: number } | null>(null);
  const cancelling = useRef(false);
  /** What a release asked for while the microphone was still opening. */
  const pendingRelease = useRef<'send' | 'cancel' | null>(null);
  const canSend =
    !disabled && !recorder.isPreparing && (value.trim().length > 0 || files.length > 0);
  /** The slot at the row's end: send once there is something to send, else the microphone. */
  const showSend = value.trim().length > 0 || files.length > 0;

  // A refusal is a toast, not a sentence parked under the field. WhatsApp and
  // Telegram keep the row itself clean: a tap that was too short, a refused
  // microphone and a spent allowance all say their piece once and leave, and
  // nothing accumulates under the input while the member is typing. One `id`
  // per subject, so a repeated failure replaces the last toast instead of
  // stacking a column of the same sentence.
  useEffect(() => {
    if (recorder.error) toast.error(recorder.error, { id: 'chat-composer-error' });
  }, [recorder.error]);

  // The cap ends the capture by itself, and the note is still sent: someone who
  // kept talking past five minutes gets their words, not a discarded clip.
  useEffect(() => {
    if (!recorder.isRecording || recorder.elapsedMs < VOICE_NOTE_MAX_MS) return;
    toast.info(VOICE_COPY.limitReached, { id: 'chat-composer-limit' });
    void finish();
    // `finish` reads the recorder's current capture; the elapsed guard above is
    // what keeps this from re-running on every tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recorder.elapsedMs, recorder.isRecording]);

  async function finish() {
    const clip = await recorder.stop();
    setLocked(false);
    if (clip) onRecorded(clip);
  }

  function cancel() {
    recorder.cancel();
    setLocked(false);
  }

  function onPointerDown(event: React.PointerEvent<HTMLButtonElement>) {
    if (disabled || recorder.isPreparing) return;
    event.preventDefault();
    cancelling.current = false;
    pendingRelease.current = null;
    origin.current = { x: event.clientX, y: event.clientY };
    setPressing(true);

    // The permission prompt can outlast the press. What the release asked for is
    // remembered and carried out the moment the microphone is actually open.
    void recorder.start().then((opened) => {
      if (!opened) return;
      const intent = pendingRelease.current;
      pendingRelease.current = null;
      if (intent === 'cancel') cancel();
      else if (intent === 'send') void finish();
    });
  }

  function onPointerMove(event: React.PointerEvent<HTMLButtonElement>) {
    if (!pressing || !origin.current || locked) return;
    const distance = Math.hypot(event.clientX - origin.current.x, event.clientY - origin.current.y);
    cancelling.current = distance > CANCEL_DISTANCE_PX;
  }

  function onPointerUp() {
    if (!pressing) return;
    setPressing(false);
    origin.current = null;
    if (locked) return;
    if (cancelling.current) {
      pendingRelease.current = 'cancel';
      cancel();
      return;
    }
    pendingRelease.current = 'send';
    void finish();
  }

  return (
    <>
      <ChatStagedFiles files={files} onRemoveFile={onRemoveFile} />

      <div className="flex items-end gap-2">
        {recorder.isRecording ? (
          <>
            <div className="flex min-h-10 flex-1 items-center gap-2 rounded-xl border border-destructive/40 bg-destructive/10 px-2 py-1.5 text-[11px] text-foreground">
              <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-destructive" />
              <span className="font-digits shrink-0 tabular-nums" dir="ltr">
                {formatVoiceDuration(recorder.elapsedMs)}
              </span>
              <span aria-hidden className="flex h-5 flex-1 items-end gap-0.5 overflow-hidden">
                {(recorder.levels.length > 0
                  ? recorder.levels
                  : new Array(IDLE_LEVELS).fill(0)
                ).map((level, index) => (
                  <span
                    key={index}
                    className={cn(
                      'w-1 shrink-0 rounded-full bg-destructive/70',
                      level > 0.66 ? 'h-5' : level > 0.4 ? 'h-4' : level > 0.15 ? 'h-3' : 'h-1'
                    )}
                  />
                ))}
              </span>
              <span className="hidden shrink-0 text-muted-foreground sm:inline">
                {locked ? VOICE_COPY.releaseToSend : VOICE_COPY.slideToCancel}
              </span>
              <button
                type="button"
                onClick={cancel}
                aria-label={VOICE_COPY.cancelRecording}
                className="shrink-0 rounded p-0.5 hover:text-destructive"
              >
                <X size={13} />
              </button>
              <button
                type="button"
                onClick={() => setLocked((current) => !current)}
                aria-label={locked ? VOICE_COPY.unlockRecording : VOICE_COPY.lockRecording}
                aria-pressed={locked}
                className={cn(
                  'shrink-0 rounded p-0.5',
                  locked ? 'text-primary' : 'hover:text-foreground'
                )}
              >
                <Lock size={13} />
              </button>
            </div>

            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={VOICE_COPY.stopAndSend}
              disabled={recorder.isPreparing}
              onClick={() => void finish()}
              className="text-destructive"
            >
              <Square size={14} />
            </Button>
          </>
        ) : (
          <>
            <div className="relative flex min-h-10 flex-1 items-end">
              <textarea
                value={value}
                onChange={(event) => {
                  onValueChange(event.target.value);
                  // A draft that is being typed says so; a cleared one says nothing,
                  // and the reader's own five-second window closes it.
                  if (onTyping && event.target.value.trim()) onTyping();
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    if (canSend) onSend();
                  }
                }}
                rows={1}
                maxLength={4000}
                placeholder={placeholder}
                aria-label={ariaLabel}
                // The clip lives inside the field, so the text keeps clear of it.
                className="max-h-32 min-h-10 w-full resize-none rounded-xl border border-border/70 bg-background py-2 pe-10 ps-3 text-sm text-foreground outline-none placeholder:text-muted-foreground/60 focus-visible:ring-2 focus-visible:ring-primary/40"
              />
              <ChatAttachButton
                onAddFiles={onAddFiles}
                disabled={disabled}
                className="absolute bottom-1 end-1 inline-flex size-8 items-center justify-center rounded-full text-muted-foreground transition-safe hover:bg-muted/60 hover:text-foreground disabled:opacity-50"
              />
            </div>

            {showSend ? (
              <Button
                type="submit"
                variant="hero"
                size="icon-sm"
                aria-label={sendLabel}
                disabled={!canSend}
                onClick={(event) => {
                  event.preventDefault();
                  onSend();
                }}
              >
                {sendIcon}
              </Button>
            ) : (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={VOICE_COPY.record}
                aria-pressed={false}
                disabled={disabled || recorder.isPreparing}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                onPointerLeave={onPointerMove}
              >
                <Mic size={16} />
              </Button>
            )}
          </>
        )}
      </div>

      {recorder.isPreparing && (
        <p className="sr-only" aria-live="polite">
          {VOICE_COPY.preparing}
        </p>
      )}
    </>
  );
}
