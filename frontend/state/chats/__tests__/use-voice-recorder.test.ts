import { describe, expect, it } from 'vitest';

import { encodeWav, peaksOf } from '@/frontend/state/chats/use-voice-recorder';

/**
 * The two pure pieces of the recorder (ADR-0127). The capture itself needs a
 * microphone and `MediaRecorder`, so it is exercised by hand; what a WAV is and
 * how a clip's shape is drawn are pinned here.
 */
describe('encodeWav', () => {
  it('writes a mono 16-bit header at the rate it is given', () => {
    const buffer = encodeWav(new Float32Array([0, 1, -1]), 24_000);
    const view = new DataView(buffer);

    expect(view.getUint32(24, true)).toBe(24_000);
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint16(34, true)).toBe(16);
    expect(buffer.byteLength).toBe(44 + 3 * 2);
  });

  it('clamps samples rather than wrapping them', () => {
    const view = new DataView(encodeWav(new Float32Array([2, -2]), 24_000));

    expect(view.getInt16(44, true)).toBe(0x7fff);
    expect(view.getInt16(46, true)).toBe(-0x8000);
  });
});

describe('peaksOf', () => {
  it('normalises the loudest bar to one', () => {
    const peaks = peaksOf(new Float32Array([0.5, 0.5, 0.25, 0.25]), 2);

    expect(peaks[0]).toBeCloseTo(1);
    expect(peaks[1]).toBeCloseTo(0.5);
  });

  it('keeps a silent clip flat instead of dividing by zero', () => {
    expect(peaksOf(new Float32Array([0, 0, 0, 0]), 2)).toEqual([0, 0]);
  });
});
