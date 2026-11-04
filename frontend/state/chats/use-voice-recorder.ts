'use client';

import { useCallback, useRef, useState } from 'react';

/**
 * A voice note, recorded in the browser and handed over as a WAV file.
 *
 * The gateway transcribes WAV natively, and the bridge learned that OGG is the
 * only fallback worth carrying — but the browser records WebM/Opus, and no
 * decoder here can read that back on the server. So the clip is decoded and
 * re-rendered at 16 kHz mono in the page: one speech-shaped file that every audio
 * model on the provider's list accepts, with no server-side ffmpeg.
 *
 * Browser-only by construction (`MediaRecorder`, `OfflineAudioContext`), so it is
 * not unit-tested; the turn's transcription path is.
 */
export interface VoiceRecorderState {
  /** Microphone is capturing. */
  isRecording: boolean;
  /** The clip is being decoded and re-rendered. */
  isPreparing: boolean;
  /** A sentence for the composer, or null. */
  error: string | null;
  start(): Promise<void>;
  /** Stops and answers the WAV, or null when nothing usable was captured. */
  stop(): Promise<File | null>;
  reset(): void;
}

const TARGET_RATE = 16_000;

export const VOICE_PERMISSION_ERROR = 'تعذّر التسجيل. تحقّق من إذن الميكروفون.';

export function useVoiceRecorder(): VoiceRecorderState {
  const [isRecording, setIsRecording] = useState(false);
  const [isPreparing, setIsPreparing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);

  const reset = useCallback(() => {
    setError(null);
  }, []);

  const start = useCallback(async () => {
    setError(null);
    if (recorder.current) return;

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const next = new MediaRecorder(stream);
      chunks.current = [];

      next.addEventListener('dataavailable', (event) => {
        if (event.data.size > 0) chunks.current.push(event.data);
      });
      next.addEventListener('stop', () => {
        for (const track of stream.getTracks()) track.stop();
      });

      next.start();
      recorder.current = next;
      setIsRecording(true);
    } catch {
      setError(VOICE_PERMISSION_ERROR);
    }
  }, []);

  const stop = useCallback(async (): Promise<File | null> => {
    const active = recorder.current;
    if (!active) return null;

    setIsPreparing(true);
    try {
      const recorded = await new Promise<Blob>((resolve) => {
        active.addEventListener(
          'stop',
          () => resolve(new Blob(chunks.current, { type: active.mimeType })),
          {
            once: true,
          }
        );
        active.stop();
      });
      recorder.current = null;
      setIsRecording(false);

      return await toWav(recorded);
    } catch {
      setError(VOICE_PERMISSION_ERROR);
      return null;
    } finally {
      setIsPreparing(false);
    }
  }, []);

  return { isRecording, isPreparing, error, start, stop, reset };
}

/** Decode whatever the browser recorded, re-render it as 16 kHz mono, wrap in WAV. */
export async function toWav(recorded: Blob): Promise<File> {
  const decoded = await decode(recorded);
  const frames = Math.max(1, Math.ceil(decoded.duration * TARGET_RATE));
  const offline = new OfflineAudioContext(1, frames, TARGET_RATE);
  const source = offline.createBufferSource();
  source.buffer = decoded;
  source.connect(offline.destination);
  source.start();

  const rendered = await offline.startRendering();
  const bytes = encodeWav(rendered.getChannelData(0), TARGET_RATE);
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
