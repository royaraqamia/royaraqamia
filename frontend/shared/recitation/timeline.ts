import type { QuranAudioFile } from '@/shared/contracts/quran-audio';

/**
 * A sura's recitation as one timeline.
 *
 * The Recitation is one file per Ayah (ADR-0062), so "where am I in the sura"
 * is not the player's own clock: it is the Ayah's start plus the position inside
 * it. The start of each Ayah is derived from the manifest's size and the
 * edition's published bitrate, because the files are CBR and the vendor floor
 * refuses a set that disagrees with itself. A real duration read from the audio
 * element replaces the estimate as each Ayah plays.
 */
export interface Timeline {
  /** Seconds from the start of the sura to the first byte of each Ayah. */
  readonly starts: readonly number[];
  /** Each Ayah's length in seconds. */
  readonly seconds: readonly number[];
  readonly total: number;
}

/** An MP3 at a published CBR bitrate: bytes to seconds. */
export function estimatedAyahSeconds(bytes: number, bitrateKbps: number): number {
  if (!Number.isFinite(bytes) || bytes <= 0) return 0;
  if (!Number.isFinite(bitrateKbps) || bitrateKbps <= 0) return 0;
  return (bytes * 8) / (bitrateKbps * 1000);
}

/** The starts that follow from a list of Ayah lengths. */
export function timelineFrom(seconds: readonly number[]): Timeline {
  const starts: number[] = [];
  let total = 0;
  for (const value of seconds) {
    starts.push(total);
    total += Number.isFinite(value) && value > 0 ? value : 0;
  }
  return { starts, seconds, total };
}

/** A timeline for a manifest's files at the edition's bitrate. */
export function buildTimeline(
  files: readonly Pick<QuranAudioFile, 'bytes'>[],
  bitrateKbps: number
): Timeline {
  return timelineFrom(files.map((file) => estimatedAyahSeconds(file.bytes, bitrateKbps)));
}

/**
 * Replaces one Ayah's length with the duration the element actually reported.
 *
 * Only the Ayah being played is corrected, so the starts before it do not move:
 * the seek bar cannot jump while the reader is listening to it.
 */
export function withAyahSeconds(timeline: Timeline, index: number, seconds: number): Timeline {
  if (index < 0 || index >= timeline.seconds.length) return timeline;
  if (!Number.isFinite(seconds) || seconds <= 0) return timeline;
  if (Math.abs((timeline.seconds[index] ?? 0) - seconds) < 0.05) return timeline;

  const next = timeline.seconds.slice();
  next[index] = seconds;
  return timelineFrom(next);
}

export interface TimelinePosition {
  readonly index: number;
  readonly offset: number;
}

/**
 * Where a time on the sura's timeline falls.
 *
 * A seek is answered as an Ayah and an offset inside it, because that is the
 * only thing this player can actually start: swapping the file is the seek.
 */
export function positionAt(timeline: Timeline, at: number): TimelinePosition {
  const count = timeline.seconds.length;
  if (count === 0) return { index: 0, offset: 0 };

  const clamped = Number.isFinite(at)
    ? Math.min(Math.max(at, 0), Math.max(timeline.total - 0.001, 0))
    : 0;

  let low = 0;
  let high = count - 1;
  let index = 0;
  while (low <= high) {
    const middle = (low + high) >> 1;
    if ((timeline.starts[middle] ?? 0) <= clamped) {
      index = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }

  return { index, offset: Math.max(0, clamped - (timeline.starts[index] ?? 0)) };
}

/** Seconds from the start of the sura to the first byte of one Ayah. */
export function startOf(timeline: Timeline, index: number): number {
  return timeline.starts[index] ?? 0;
}
