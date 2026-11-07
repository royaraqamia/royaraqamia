'use client';

import { useRef, useState } from 'react';
import { Download, Pause, Play } from 'lucide-react';

import { getChatAttachmentUrl } from '@/frontend/api/chats';
import { cn } from '@/frontend/shared/cn';
import { peaksOf } from '@/frontend/state/chats/use-voice-recorder';
import { CHAT_VOICE_NOTE_SAMPLE_RATE, type ChatAttachment } from '@/shared/contracts/chat';
import { formatVoiceDuration, VOICE_COPY } from './voice-copy';

/** The bars the shape is drawn with. */
const BARS = 40;
/** The speeds the player cycles through, in the order a member expects. */
const SPEEDS = [1, 1.5, 2] as const;

/**
 * A clip's shape, kept for the life of the page: the player decodes the file
 * once to draw it, and scrolling the thread must not decode it again.
 */
const peakCache = new Map<string, number[]>();

/**
 * A received voice note (ADR-0127): play, seek, speed and the clip's own shape.
 *
 * The signed URL is asked for on the first press rather than on render — a
 * thread of twenty notes must not mint twenty URLs to draw itself — and the
 * peaks come from the same clip, decoded once and cached. A note that cannot be
 * read falls back to the download it always was.
 */
export function VoiceNotePlayer({
  conversationId,
  attachment,
  mine,
  onDownload,
  resolveUrl,
}: {
  conversationId: string;
  attachment: ChatAttachment;
  mine: boolean;
  onDownload: (attachment: ChatAttachment) => void;
  /**
   * Where this note's bytes come from (#1033): a queued note is still on the
   * device, so the thread hands its blob URL here instead of asking the server.
   */
  resolveUrl?: (attachment: ChatAttachment) => Promise<string | null>;
}) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [durationMs, setDurationMs] = useState(() => estimatedDurationMs(attachment));
  const [peaks, setPeaks] = useState<number[]>(() => peakCache.get(attachment.id) ?? []);
  const [speed, setSpeed] = useState(0);
  const [failed, setFailed] = useState(false);

  /** The clip's bytes, read once: the URL to play, and the shape to draw. */
  async function open(): Promise<string | null> {
    if (url) return url;

    const source = resolveUrl
      ? await resolveUrl(attachment)
      : ((await getChatAttachmentUrl(conversationId, attachment.id))?.url ?? null);
    if (!source) {
      setFailed(true);
      return null;
    }
    setUrl(source);
    void drawShape(source);
    return source;
  }

  async function drawShape(source: string) {
    if (peaks.length > 0) return;
    try {
      const response = await fetch(source);
      if (!response.ok) return;
      const bytes = await response.arrayBuffer();
      const context = new AudioContext();
      try {
        const decoded = await context.decodeAudioData(bytes);
        const shape = peaksOf(decoded.getChannelData(0), BARS);
        peakCache.set(attachment.id, shape);
        setPeaks(shape);
        setDurationMs(decoded.duration * 1_000);
      } finally {
        await context.close();
      }
    } catch {
      // A shape is decoration: a clip that will not decode still plays, with
      // flat bars and the duration its size implies.
    }
  }

  async function toggle() {
    if (playing) {
      audio.current?.pause();
      return;
    }

    const source = await open();
    if (!source) return;

    if (!audio.current) {
      const element = new Audio(source);
      element.playbackRate = SPEEDS[speed] ?? 1;
      element.addEventListener('timeupdate', () => {
        const total = element.duration;
        setProgress(Number.isFinite(total) && total > 0 ? element.currentTime / total : 0);
      });
      element.addEventListener('loadedmetadata', () => {
        if (Number.isFinite(element.duration)) setDurationMs(element.duration * 1_000);
      });
      element.addEventListener('play', () => setPlaying(true));
      element.addEventListener('pause', () => setPlaying(false));
      element.addEventListener('ended', () => {
        setPlaying(false);
        setProgress(0);
        element.currentTime = 0;
      });
      audio.current = element;
    }

    try {
      await audio.current.play();
    } catch {
      setFailed(true);
    }
  }

  function seek(event: React.MouseEvent<HTMLDivElement>) {
    const element = audio.current;
    if (!element || !Number.isFinite(element.duration) || element.duration <= 0) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width));
    element.currentTime = ratio * element.duration;
    setProgress(ratio);
  }

  function cycleSpeed() {
    const next = (speed + 1) % SPEEDS.length;
    setSpeed(next);
    if (audio.current) audio.current.playbackRate = SPEEDS[next] ?? 1;
  }

  if (failed) {
    return (
      <button
        type="button"
        onClick={() => onDownload(attachment)}
        className="flex w-full items-center gap-1.5 rounded-lg bg-background/20 px-2 py-1 text-right text-[11px] hover:bg-background/30"
      >
        <Download size={12} className="shrink-0" />
        <span className="truncate">{VOICE_COPY.loadFailed}</span>
      </button>
    );
  }

  const bars = peaks.length > 0 ? peaks : new Array(BARS).fill(0.15);

  return (
    <div className="flex min-w-52 items-center gap-2">
      <button
        type="button"
        onClick={() => void toggle()}
        aria-label={playing ? VOICE_COPY.pause : VOICE_COPY.play}
        aria-pressed={playing}
        className={cn(
          'grid h-8 w-8 shrink-0 place-items-center rounded-full',
          mine ? 'bg-primary-foreground/20' : 'bg-foreground/10'
        )}
      >
        {playing ? <Pause size={14} /> : <Play size={14} className="translate-x-0.5" />}
      </button>

      <div className="flex flex-1 flex-col gap-1">
        <div
          role="slider"
          aria-label={VOICE_COPY.play}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progress * 100)}
          tabIndex={0}
          onClick={seek}
          className="flex h-6 cursor-pointer items-end gap-0.5"
        >
          {bars.map((peak, index) => (
            <span
              key={index}
              className={cn(
                'w-0.5 shrink-0 rounded-full',
                index / bars.length <= progress ? 'opacity-100' : 'opacity-40',
                peak > 0.75 ? 'h-6' : peak > 0.5 ? 'h-5' : peak > 0.25 ? 'h-3' : 'h-1.5',
                mine ? 'bg-primary-foreground' : 'bg-foreground'
              )}
            />
          ))}
        </div>
        <span className="font-digits text-[10px] tabular-nums opacity-70" dir="ltr">
          {formatVoiceDuration(durationMs)}
        </span>
      </div>

      <button
        type="button"
        onClick={cycleSpeed}
        aria-label={VOICE_COPY.speed}
        className={cn(
          'font-digits shrink-0 rounded-full px-1.5 py-0.5 text-[10px] tabular-nums',
          mine ? 'bg-primary-foreground/20' : 'bg-foreground/10'
        )}
      >
        {SPEEDS[speed]}x
      </button>
    </div>
  );
}

/** A WAV's length from its size, before anything has decoded it. */
function estimatedDurationMs(attachment: ChatAttachment): number {
  if (!attachment.mimeType.toLowerCase().includes('wav')) return 0;
  return (attachment.byteSize / (CHAT_VOICE_NOTE_SAMPLE_RATE * 2)) * 1_000;
}
