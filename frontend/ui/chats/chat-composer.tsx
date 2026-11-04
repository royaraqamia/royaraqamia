'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Lock, Mic, Paperclip, Square, X } from 'lucide-react';

import { cn } from '@/frontend/shared/cn';
import { formatAttachmentSize } from '@/frontend/shared/format-bytes';
import { Button } from '@/frontend/ui/primitives/button';
import { useVoiceRecorder, VOICE_NOTE_MAX_MS } from '@/frontend/state/chats/use-voice-recorder';
import { CHAT_VOICE_NOTE_SAMPLE_RATE, chatAttachmentIsAudio } from '@/shared/contracts/chat';
import { formatVoiceDuration, VOICE_COPY } from './voice-copy';

/** How far a pressed pointer travels before the release counts as a cancel. */
const CANCEL_DISTANCE_PX = 64;
/** The bars the recording meter draws before the first reading arrives. */
const IDLE_LEVELS = 16;

/**
 * The composer's input row, shared by the member's thread and the assistant's
 * (ADR-0127).
 *
 * One control, not two copies: the textarea, the paperclip, the microphone and
 * the send button in the same order, with the microphone immediately beside the
 * paperclip — the placement WhatsApp and Telegram trained everyone to expect.
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
  children,
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
  /** The line under the row: the quota, the remaining turns, a refusal. */
  children?: ReactNode;
}) {
  const recorder = useVoiceRecorder();
  const [locked, setLocked] = useState(false);
  const [pressing, setPressing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const origin = useRef<{ x: number; y: number } | null>(null);
  const cancelling = useRef(false);
  /** What a release asked for while the microphone was still opening. */
  const pendingRelease = useRef<'send' | 'cancel' | null>(null);
  const canSend =
    !disabled && !recorder.isPreparing && (value.trim().length > 0 || files.length > 0);

  // The cap ends the capture by itself, and the note is still sent: someone who
  // kept talking past five minutes gets their words, not a discarded clip.
  useEffect(() => {
    if (!recorder.isRecording || recorder.elapsedMs < VOICE_NOTE_MAX_MS) return;
    setNotice(VOICE_COPY.limitReached);
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
    setNotice(null);
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
      {files.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {files.map((file, index) => (
            <li
              key={`${file.name}-${index}`}
              className="flex max-w-64 items-center gap-1 rounded-lg bg-muted/60 px-2 py-1 text-[11px] text-foreground/80"
            >
              {chatAttachmentIsAudio(file.type) ? (
                <Mic size={11} className="shrink-0" />
              ) : (
                <Paperclip size={11} className="shrink-0" />
              )}
              <span className="truncate">
                {chatAttachmentIsAudio(file.type) ? VOICE_COPY.voiceNote : file.name}
              </span>
              <span className="shrink-0 text-muted-foreground/70">
                {chatAttachmentIsAudio(file.type)
                  ? formatVoiceDuration(wavDurationMs(file.size))
                  : formatAttachmentSize(file.size)}
              </span>
              <button
                type="button"
                onClick={() => onRemoveFile(index)}
                aria-label={VOICE_COPY.removeFile.replace('{name}', file.name)}
                className="shrink-0 rounded p-0.5 hover:text-destructive"
              >
                <X size={11} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-end gap-2">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(event) => {
            onAddFiles(Array.from(event.target.files ?? []));
            // Reset so picking the same file twice still fires a change.
            event.target.value = '';
          }}
        />

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
              className="max-h-32 min-h-10 flex-1 resize-none rounded-xl border border-border/70 bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground/60 focus-visible:ring-2 focus-visible:ring-primary/40"
            />
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              aria-label={VOICE_COPY.attach}
              disabled={disabled}
              onClick={() => fileInputRef.current?.click()}
            >
              <Paperclip size={16} />
            </Button>
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
          </>
        )}
      </div>

      {recorder.isPreparing && (
        <p className="text-[11px] text-muted-foreground">{VOICE_COPY.preparing}</p>
      )}
      {(recorder.error ?? notice) && (
        <p role="alert" className="text-[11px] font-medium text-destructive">
          {recorder.error ?? notice}
        </p>
      )}

      {children}
    </>
  );
}

/**
 * A WAV's length from its size alone: 24 kHz mono, 16 bits. The staged chip can
 * therefore show a duration before anything has decoded it.
 */
function wavDurationMs(bytes: number): number {
  return (bytes / (CHAT_VOICE_NOTE_SAMPLE_RATE * 2)) * 1_000;
}
