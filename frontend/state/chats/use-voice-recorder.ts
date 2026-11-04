'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import {
  CHAT_VOICE_NOTE_MAX_MS,
  CHAT_VOICE_NOTE_MIN_MS,
  CHAT_VOICE_NOTE_SAMPLE_RATE,
} from '@/shared/contracts/chat';

/**
 * A voice note, recorded in the browser and handed over as a WAV file
 * (ADR-0126, ADR-0127).
 *
 * The gateway transcribes WAV natively, the bridge learned that OGG is the only
 * fallback worth carrying, and the browser records WebM/Opus or MP4/AAC — so the
 * clip is decoded and re-rendered at 24 kHz mono in the page: one file every
 * audio path accepts, small enough to send, good enough to play. `MediaRecorder`'s
 * own container is never uploaded.
 *
 * Browser-only by construction (`MediaRecorder`, `OfflineAudioContext`), so the
 * recording itself is not unit-tested; the encoder and the peaks are, and the
 * turn's transcription path is.
 */
export interface VoiceRecorderState {
  /** Microphone is capturing. */
  isRecording: boolean;
  /** The clip is being decoded and re-rendered. */
  isPreparing: boolean;
  /** How long the current capture has run, for the timer the bar draws. */
  elapsedMs: number;
  /** The last few loudness readings, 0–1, for the bar's live waveform. */
  levels: number[];
  /** A sentence for the composer, or null. */
  error: string | null;
  /** Opens the microphone. False when the device or the permission refused. */
  start(): Promise<boolean>;
  /**
   * Stops and answers the WAV, or `null` when nothing usable was captured — a
   * hold shorter than the minimum, or a stream that died. The sentence explaining
   * it is already in `error`.
   */
  stop(): Promise<File | null>;
  /** Stops and throws the capture away. */
  cancel(): void;
  /** Drops the last error sentence, before the next attempt. */
  reset(): void;
}

/** The sentence a refused microphone shows — the same on both composers. */
export const VOICE_PERMISSION_ERROR = 'تعذّر التسجيل. تحقّق من إذن الميكروفون.';
/** A tap, not a note: nothing is sent, and the bar says why. */
export const VOICE_TOO_SHORT_ERROR = 'اضغط مطوّلاً للتسجيل، ثم اترك الزر للإرسال.';

/** How often the timer and the level meter read the capture. */
const TICK_MS = 100;
/** Bars kept for the live waveform. */
const LEVEL_BARS = 32;

export function useVoiceRecorder(): VoiceRecorderState {
  const [isRecording, setIsRecording] = useState(false);
  const [isPreparing, setIsPreparing] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [levels, setLevels] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);

  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const analyser = useRef<AnalyserNode | null>(null);
  const context = useRef<AudioContext | null>(null);
  const chunks = useRef<Blob[]>([]);
  const startedAt = useRef(0);
  const ticker = useRef<ReturnType<typeof setInterval> | null>(null);

  const reset = useCallback(() => setError(null), []);

  /** Everything a capture opened, closed exactly once. */
  const release = useCallback(() => {
    if (ticker.current !== null) {
      clearInterval(ticker.current);
      ticker.current = null;
    }
    for (const track of stream.current?.getTracks() ?? []) track.stop();
    stream.current = null;
    analyser.current = null;
    void context.current?.close().catch(() => undefined);
    context.current = null;
  }, []);

  useEffect(() => release, [release]);

  const start = useCallback(async () => {
    setError(null);
    if (recorder.current) return true;

    try {
      const captured = await navigator.mediaDevices.getUserMedia({ audio: true });
      const next = new MediaRecorder(captured, { mimeType: preferredMimeType() });

      // The meter is what makes the bar move while the member speaks. A device
      // without an analyser still records: the bars simply stay flat.
      try {
        const audio = new AudioContext();
        const node = audio.createAnalyser();
        node.fftSize = LEVEL_BARS * 2;
        audio.createMediaStreamSource(captured).connect(node);
        context.current = audio;
        analyser.current = node;
      } catch {
        analyser.current = null;
      }

      chunks.current = [];
      next.addEventListener('dataavailable', (event) => {
        if (event.data.size > 0) chunks.current.push(event.data);
      });

      next.start(TICK_MS);
      recorder.current = next;
      stream.current = captured;
      startedAt.current = Date.now();
      setElapsedMs(0);
      setLevels([]);
      setIsRecording(true);

      ticker.current = setInterval(() => {
        setElapsedMs(Date.now() - startedAt.current);
        const node = analyser.current;
        if (!node) return;
        const bins = new Uint8Array(node.frequencyBinCount);
        node.getByteFrequencyData(bins);
        const loudness = bins.reduce((sum, value) => sum + value, 0) / bins.length / 255;
        setLevels((current) => [...current, loudness].slice(-LEVEL_BARS));
      }, TICK_MS);

      return true;
    } catch {
      release();
      setError(VOICE_PERMISSION_ERROR);
      return false;
    }
  }, [release]);

  const finish = useCallback(
    async (keep: boolean): Promise<File | null> => {
      const active = recorder.current;
      if (!active) return null;

      const held = Date.now() - startedAt.current;
      setIsPreparing(true);

      try {
        const recorded = await new Promise<Blob>((resolve) => {
          active.addEventListener(
            'stop',
            () => resolve(new Blob(chunks.current, { type: active.mimeType })),
            { once: true }
          );
          active.stop();
        });
        recorder.current = null;
        release();
        setIsRecording(false);
        setElapsedMs(0);

        if (!keep || held < CHAT_VOICE_NOTE_MIN_MS) {
          if (keep) setError(VOICE_TOO_SHORT_ERROR);
          return null;
        }

        return await toWav(recorded);
      } catch {
        setError(VOICE_PERMISSION_ERROR);
        return null;
      } finally {
        setIsPreparing(false);
      }
    },
    [release]
  );

  const stop = useCallback(() => finish(true), [finish]);
  const cancel = useCallback(() => {
    void finish(false);
  }, [finish]);

  return {
    isRecording,
    isPreparing,
    elapsedMs,
    levels,
    error,
    start,
    stop,
    cancel,
    reset,
  };
}

/** The first container this browser will actually record. */
export function preferredMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  for (const candidate of ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus']) {
    if (MediaRecorder.isTypeSupported(candidate)) return candidate;
  }
  return '';
}

/** Decode whatever the browser recorded, re-render it at 24 kHz mono, wrap in WAV. */
export async function toWav(recorded: Blob): Promise<File> {
  const decoded = await decode(recorded);
  const rate = CHAT_VOICE_NOTE_SAMPLE_RATE;
  const frames = Math.max(1, Math.ceil(decoded.duration * rate));
  const offline = new OfflineAudioContext(1, frames, rate);
  const source = offline.createBufferSource();
  source.buffer = decoded;
  source.connect(offline.destination);
  source.start();

  const rendered = await offline.startRendering();
  const bytes = encodeWav(rendered.getChannelData(0), rate);
  return new File([bytes], 'voice-note.wav', { type: 'audio/wav' });
}

async function decode(recorded: Blob): Promise<AudioBuffer> {
  const context = new AudioContext();
  try {
    return await context.decodeAudioData(await recorded.arrayBuffer());
  } finally {
    await context.close();
  }
}

/**
 * A clip's shape, as bars: the peak of each slice, normalised so the loudest bar
 * is full height. The player draws it, so a note is recognisable before it is
 * played. Silence is flat rather than a division by zero.
 */
export function peaksOf(samples: Float32Array, bars: number): number[] {
  if (bars <= 0) return [];
  const size = Math.max(1, Math.floor(samples.length / bars));
  const peaks: number[] = [];
  let loudest = 0;

  for (let bar = 0; bar < bars; bar += 1) {
    let peak = 0;
    const start = bar * size;
    for (let index = start; index < Math.min(start + size, samples.length); index += 1) {
      const value = Math.abs(samples[index] ?? 0);
      if (value > peak) peak = value;
    }
    peaks.push(peak);
    if (peak > loudest) loudest = peak;
  }

  return loudest === 0 ? peaks : peaks.map((peak) => peak / loudest);
}

/** A mono 16-bit PCM WAV: 44-byte header, then the samples little-endian. */
export function encodeWav(samples: Float32Array, sampleRate: number): ArrayBuffer {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const writeText = (offset: number, text: string) => {
    for (let index = 0; index < text.length; index += 1) {
      view.setUint8(offset + index, text.charCodeAt(index));
    }
  };

  writeText(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  writeText(8, 'WAVE');
  writeText(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeText(36, 'data');
  view.setUint32(40, samples.length * 2, true);

  let offset = 44;
  for (const sample of samples) {
    const clamped = Math.max(-1, Math.min(1, sample));
    view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
    offset += 2;
  }

  return buffer;
}

/** The ceiling the bar counts towards, exported so the UI never re-states it. */
export const VOICE_NOTE_MAX_MS = CHAT_VOICE_NOTE_MAX_MS;
