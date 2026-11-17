'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { Lock, Mic, Square, X } from 'lucide-react';

import { cn } from '@/frontend/shared/cn';
import { Button } from '@/frontend/ui/primitives/button';
import { holdUnrequestedReload } from '@/frontend/shared/sw-update';
import { useVoiceRecorder, VOICE_NOTE_MAX_MS } from '@/frontend/state/chats/use-voice-recorder';
import { formatVoiceDuration, VOICE_COPY } from './voice-copy';
import { ChatAttachButton, ChatStagedFiles } from './chat-attach-control';
import { ChatField, type ChatFieldLabels } from './chat-field';

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
 *
 * Return adds a line and nothing on the keyboard sends: the send button is the
 * only way to send, and the field grows with the draft until it scrolls.
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
  onDraftEmpty,
  onSend,
  files,
  onAddFiles,
  onRemoveFile,
  onRecorded,
  onRecordingChange,
  maxDurationMs = VOICE_NOTE_MAX_MS,
  disabled,
  placeholder,
  ariaLabel,
  sendLabel,
  sendIcon,
  recordLabel = VOICE_COPY.record,
  stopLabel = VOICE_COPY.stopAndSend,
  cancelLabel = VOICE_COPY.cancelRecording,
  fieldLabels,
}: {
  value: string;
  onValueChange: (value: string) => void;
  /** A keystroke, for the member thread's typing channel. */
  onTyping?: () => void;
  /** The draft became empty: the member stopped rather than pausing. */
  onDraftEmpty?: () => void;
  onSend: () => void;
  files: File[];
  onAddFiles: (files: File[]) => void;
  onRemoveFile: (index: number) => void;
  /** A finished clip, already a WAV; the parent stages and sends it. */
  onRecorded: (file: File) => void;
  /** The microphone opened or closed, so the thread can announce it. */
  onRecordingChange?: (recording: boolean) => void;
  /**
   * The longest note this member's allowance can carry, so the recorder stops
   * and sends before the composer would refuse the file.
   */
  maxDurationMs?: number;
  disabled: boolean;
  placeholder: string;
  ariaLabel: string;
  /** The send button's own name, which each thread words for itself. */
  sendLabel: string;
  /** The send glyph, named by the thread that draws the row (ADR-0100). */
  sendIcon: ReactNode;
  /** The microphone, the bar's cancel and its stop-and-send, named by the thread. */
  recordLabel?: string;
  stopLabel?: string;
  cancelLabel?: string;
  /** The field's six marks, worded by the surface that draws the row (ADR-0193). */
  fieldLabels: ChatFieldLabels;
}) {
  const recorder = useVoiceRecorder();
  const [locked, setLocked] = useState(false);
  const origin = useRef<{ x: number; y: number } | null>(null);
  const cancelling = useRef(false);
  /** What a release asked for while the microphone was still opening. */
  const pendingRelease = useRef<'send' | 'cancel' | null>(null);
  /** The listeners a running press owns, so an unmount or a second press ends them. */
  const endTracking = useRef<(() => void) | null>(null);
  // The release reads the lock from a ref: the listeners outlive the render that
  // opened the press, and the bar's lock is a state.
  const lockedRef = useRef(locked);
  lockedRef.current = locked;
  const canSend =
    !disabled && !recorder.isPreparing && (value.trim().length > 0 || files.length > 0);
  /** The slot at the row's end: send once there is something to send, else the microphone. */
  const showSend = value.trim().length > 0 || files.length > 0;

  /**
   * The row's own work is the work an unrequested reload would destroy
   * (ADR-0170): the words not sent yet, the clip staged behind them, and the
   * capture itself — the last one being exactly what a five-minute note lost
   * when a swap replaced the page at its own stop (#1320). The hold lives as
   * long as one of them does, and its release is what lets a held reload land.
   *
   * It is one boolean rather than the draft itself so a keystroke is not a
   * release-and-re-take: a gap between the two is a gap a swap could land in.
   */
  const holdsReload =
    value.trim().length > 0 || files.length > 0 || recorder.isRecording || recorder.isPreparing;
  useEffect(() => {
    if (!holdsReload) return;
    return holdUnrequestedReload();
  }, [holdsReload]);

  // A refusal is a toast, not a sentence parked under the field. WhatsApp and
  // Telegram keep the row itself clean: a tap that was too short, a refused
  // microphone and a spent allowance all say their piece once and leave, and
  // nothing accumulates under the input while the member is typing. One `id`
  // per subject, so a repeated failure replaces the last toast instead of
  // stacking a column of the same sentence.
  useEffect(() => {
    if (recorder.error) toast.error(recorder.error, { id: 'chat-composer-error' });
  }, [recorder.error]);

  /**
   * The peer hears the microphone, not the intention: this mirrors the
   * recorder's own state once per change, and ends the line when the composer
   * goes away. A hands-free recording is kept alive by the presence hook's
   * heartbeat, so one announcement is all this side sends.
   */
  const announcedRecording = useRef(false);
  useEffect(() => {
    if (!onRecordingChange) return;

    if (announcedRecording.current !== recorder.isRecording) {
      announcedRecording.current = recorder.isRecording;
      onRecordingChange(recorder.isRecording);
    }

    return () => {
      if (!announcedRecording.current) return;
      announcedRecording.current = false;
      onRecordingChange(false);
    };
  }, [onRecordingChange, recorder.isRecording]);

  // A press that is interrupted by the composer going away must not leave its
  // window listeners behind.
  useEffect(() => () => endTracking.current?.(), []);

  // The cap ends the capture by itself, and the note is still sent: someone who
  // kept talking past the allowance gets their words, not a discarded clip.
  useEffect(() => {
    if (!recorder.isRecording || recorder.elapsedMs < maxDurationMs) return;
    toast.info(VOICE_COPY.limitReached, { id: 'chat-composer-limit' });
    void finish();
    // `finish` reads the recorder's current capture; the elapsed guard above is
    // what keeps this from re-running on every tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maxDurationMs, recorder.elapsedMs, recorder.isRecording]);

  async function finish() {
    const clip = await recorder.stop();
    setLocked(false);
    if (clip) onRecorded(clip);
  }

  function cancel() {
    recorder.cancel();
    setLocked(false);
  }

  /**
   * The press is tracked on `window`, not on the microphone.
   *
   * The recorder replaces the whole row with its bar the moment it opens, so the
   * button that received the press is unmounted mid-gesture — and an unmounted
   * element loses its pointer capture and stops receiving the slide and the
   * release. The hint promised a cancel nobody could reach, and a release over
   * the bar's own send button sent the clip instead. Window listeners outlive the
   * element; the geometry is the press origin's, so the gesture is the one the
   * hint describes.
   */
  function onPointerDown(event: React.PointerEvent<HTMLButtonElement>) {
    if (disabled || recorder.isPreparing) return;
    event.preventDefault();
    cancelling.current = false;
    pendingRelease.current = null;
    origin.current = { x: event.clientX, y: event.clientY };

    const end = () => {
      window.removeEventListener('pointermove', track, true);
      window.removeEventListener('pointerup', release, true);
      window.removeEventListener('pointercancel', abort, true);
      endTracking.current = null;
    };

    const track = (moveEvent: PointerEvent) => {
      if (!origin.current || lockedRef.current) return;
      const distance = Math.hypot(
        moveEvent.clientX - origin.current.x,
        moveEvent.clientY - origin.current.y
      );
      cancelling.current = distance > CANCEL_DISTANCE_PX;
    };

    function release(upEvent: PointerEvent) {
      if (!origin.current) return;
      // The release point counts too: a jump with no move event still cancels.
      track(upEvent);
      upEvent.preventDefault();
      end();
      origin.current = null;
      if (lockedRef.current) return;
      if (cancelling.current) {
        pendingRelease.current = 'cancel';
        cancel();
        return;
      }
      pendingRelease.current = 'send';
      void finish();
    }

    /** The browser took the pointer away — an alt-tab, a scroll: throw the clip. */
    function abort() {
      if (!origin.current) return;
      end();
      origin.current = null;
      if (lockedRef.current) return;
      pendingRelease.current = 'cancel';
      cancel();
    }

    endTracking.current?.();
    endTracking.current = end;
    window.addEventListener('pointermove', track, true);
    window.addEventListener('pointerup', release, true);
    window.addEventListener('pointercancel', abort, true);

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

  return (
    <>
      <ChatStagedFiles files={files} onRemoveFile={onRemoveFile} />

      <div className="flex items-end gap-2">
        {recorder.isRecording ? (
          <>
            <div className="flex min-h-11 flex-1 items-center gap-2 rounded-xl border border-destructive/40 bg-destructive/10 px-2 py-1.5 text-[11px] text-foreground">
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
                aria-label={cancelLabel}
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
              aria-label={stopLabel}
              disabled={recorder.isPreparing}
              onClick={() => void finish()}
              className="size-11 text-destructive"
            >
              <Square size={14} />
            </Button>
          </>
        ) : (
          <>
            <div className="relative flex min-h-11 min-w-0 flex-1 items-end">
              {/* The field is the editor (ADR-0193). Its padding is physical for
                  the reason the clip is: the clip is pinned to the box while the
                  text's direction follows the draft.

                  One line is 44px by arithmetic — 2px of border, 8+8 of padding
                  and a 26px line box — and 44px is the button at the row's end,
                  so the paperclip and that button share the field's centre at
                  every viewport. It used to be 40px assumed and 46.8px drawn,
                  which put both of them 3.4px low (#1583). Change one of these
                  numbers and the row stops being square. */}
              <ChatField
                value={value}
                onChange={onValueChange}
                onTyping={onTyping}
                onDraftEmpty={onDraftEmpty}
                ariaLabel={ariaLabel}
                placeholder={placeholder}
                disabled={disabled}
                labels={fieldLabels}
                className="w-full min-h-11 resize-none rounded-xl border border-border/70 bg-background py-2 pl-10 pr-3 text-base leading-[26px] text-foreground focus-visible:ring-2 focus-visible:ring-primary/40"
              />
              <ChatAttachButton
                onAddFiles={onAddFiles}
                disabled={disabled}
                className="absolute bottom-1.5 left-1 inline-flex size-8 items-center justify-center rounded-full text-muted-foreground transition-safe hover:bg-muted/60 hover:text-foreground disabled:opacity-50"
              />
            </div>

            {showSend ? (
              <Button
                type="submit"
                variant="hero"
                size="icon-sm"
                aria-label={sendLabel}
                disabled={!canSend}
                className="size-11"
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
                aria-label={recordLabel}
                aria-pressed={false}
                disabled={disabled || recorder.isPreparing}
                className="size-11"
                onPointerDown={onPointerDown}
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
