import { describe, expect, it } from 'vitest';
import { computeFrameTransform, displayToFrame, frameToDisplay } from '@/frontend/ui/scan/overlay';

// A 1280x720 camera frame decoded at 800px wide, shown in a 4:3 box.
const FRAME = {
  videoWidth: 1280,
  videoHeight: 720,
  frameWidth: 800,
  frameHeight: 450,
  boxWidth: 400,
  boxHeight: 300,
};

describe('computeFrameTransform', () => {
  it('accounts for the crop `object-cover` applies on the wide axis', () => {
    const transform = computeFrameTransform(FRAME);

    // The video is wider than the box, so height matches and width overflows.
    expect(transform.pxPerFrame).toBeCloseTo(300 / 450, 6);
    expect(transform.offsetX).toBeCloseTo((400 - 1280 * (300 / 720)) / 2, 6);
    expect(transform.offsetY).toBeCloseTo(0, 6);
  });

  it('puts the frame centre in the middle of the box', () => {
    const transform = computeFrameTransform(FRAME);
    const centre = frameToDisplay(transform, 400, 225);

    expect(centre.x).toBeCloseTo(200, 6);
    expect(centre.y).toBeCloseTo(150, 6);
  });

  it('round-trips a point', () => {
    const transform = computeFrameTransform(FRAME);
    const point = displayToFrame(transform, 137, 211);

    expect(frameToDisplay(transform, point.x, point.y).x).toBeCloseTo(137, 6);
    expect(frameToDisplay(transform, point.x, point.y).y).toBeCloseTo(211, 6);
  });

  it('degrades to identity rather than dividing by zero', () => {
    expect(computeFrameTransform({ ...FRAME, frameWidth: 0, boxWidth: 0 })).toEqual({
      pxPerFrame: 1,
      offsetX: 0,
      offsetY: 0,
    });
  });
});
