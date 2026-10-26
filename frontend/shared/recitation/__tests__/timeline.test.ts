import { describe, expect, it } from 'vitest';
import {
  buildTimeline,
  estimatedAyahSeconds,
  positionAt,
  timelineFrom,
  withAyahSeconds,
} from '@/frontend/shared/recitation/timeline';

const FILE = { bytes: 49513 };

describe('the sura as a timeline', () => {
  it('turns a published CBR size into seconds', () => {
    // 49513 bytes at 64 kbps is 6.19 seconds; the manifest publishes both.
    expect(estimatedAyahSeconds(FILE.bytes, 64)).toBeCloseTo(6.189, 3);
    expect(estimatedAyahSeconds(0, 64)).toBe(0);
    expect(estimatedAyahSeconds(FILE.bytes, 0)).toBe(0);
    expect(estimatedAyahSeconds(Number.NaN, 64)).toBe(0);
  });

  it('starts each Ayah where the one before it ends', () => {
    const timeline = buildTimeline([{ bytes: 8000 }, { bytes: 16000 }, { bytes: 8000 }], 64);

    expect(timeline.seconds.map((value) => Math.round(value))).toEqual([1, 2, 1]);
    expect(timeline.starts.map((value) => Math.round(value))).toEqual([0, 1, 3]);
    expect(Math.round(timeline.total)).toBe(4);
  });

  it('answers a time with the Ayah and the offset inside it', () => {
    const timeline = timelineFrom([10, 20, 10]);

    expect(positionAt(timeline, 0)).toEqual({ index: 0, offset: 0 });
    expect(positionAt(timeline, 15)).toEqual({ index: 1, offset: 5 });
    expect(positionAt(timeline, 30)).toEqual({ index: 2, offset: 0 });
    expect(positionAt(timeline, -3)).toEqual({ index: 0, offset: 0 });
    expect(positionAt(timeline, Number.NaN)).toEqual({ index: 0, offset: 0 });
    const end = positionAt(timeline, 999);
    expect(end.index).toBe(2);
    expect(end.offset).toBeCloseTo(9.999, 3);
  });

  it('has a place for an empty sura without dividing by nothing', () => {
    expect(timelineFrom([]).total).toBe(0);
    expect(positionAt(timelineFrom([]), 5)).toEqual({ index: 0, offset: 0 });
  });

  it('lets the element correct one length without moving the Ayat before it', () => {
    const estimated = timelineFrom([10, 20, 10]);
    const corrected = withAyahSeconds(estimated, 1, 25);

    expect(corrected.starts).toEqual([0, 10, 35]);
    expect(corrected.total).toBe(45);
    expect(withAyahSeconds(estimated, 1, 20)).toBe(estimated);
    expect(withAyahSeconds(estimated, 9, 20)).toBe(estimated);
    expect(withAyahSeconds(estimated, 1, Number.NaN)).toBe(estimated);
  });
});
