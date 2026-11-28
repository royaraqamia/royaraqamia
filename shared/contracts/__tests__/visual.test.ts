import { describe, expect, it } from 'vitest';

import {
  VISUAL_ANIMATION_MAX_FRAMES,
  VisualRenderSpecSchema,
  VisualSpecSchema,
  visualAnimationFrames,
} from '@/shared/contracts/visual';

const svg = '<svg viewBox="0 0 10 10"><rect id="box" width="10" height="10"></rect></svg>';

function spec(animation: unknown) {
  return { svg, animation };
}

describe('visual motion contract (ADR-0215 amendment)', () => {
  it('keeps a still drawing unchanged without animation', () => {
    expect(VisualSpecSchema.safeParse({ svg }).success).toBe(true);
    // Motion is a render spec, never the generated client contract.
    expect(
      VisualSpecSchema.safeParse(
        spec({
          durationMs: 1_000,
          fps: 8,
          tracks: [{ id: 'box', keyframes: [{ at: 0 }, { at: 1 }] }],
        })
      ).success
    ).toBe(false);
  });

  it('accepts a bounded animation', () => {
    const parsed = VisualRenderSpecSchema.safeParse(
      spec({
        durationMs: 1_000,
        fps: 12,
        tracks: [
          {
            id: 'box',
            keyframes: [
              { at: 0, x: 0, opacity: 1 },
              { at: 1, x: 100, opacity: 0 },
            ],
          },
        ],
      })
    );
    expect(parsed.success).toBe(true);
  });

  it('caps the frame budget at 72', () => {
    const track = { id: 'box', keyframes: [{ at: 0 }, { at: 1 }] };
    const atCeiling = VisualRenderSpecSchema.safeParse(
      spec({ durationMs: 6_000, fps: 12, tracks: [track] })
    );
    expect(atCeiling.success).toBe(true);
    const tooLong = VisualRenderSpecSchema.safeParse(
      spec({ durationMs: 6_001, fps: 12, tracks: [track] })
    );
    expect(tooLong.success).toBe(false);
    expect(visualAnimationFrames(60_000, 12)).toBe(VISUAL_ANIMATION_MAX_FRAMES);
  });

  it('refuses an element id that is not a plain identifier', () => {
    const parsed = VisualRenderSpecSchema.safeParse(
      spec({
        durationMs: 1_000,
        fps: 8,
        tracks: [{ id: 'bad id"', keyframes: [{ at: 0 }, { at: 1 }] }],
      })
    );
    expect(parsed.success).toBe(false);
  });

  it('refuses a track with fewer than two keyframes', () => {
    const parsed = VisualRenderSpecSchema.safeParse(
      spec({
        durationMs: 1_000,
        fps: 8,
        tracks: [{ id: 'box', keyframes: [{ at: 0 }] }],
      })
    );
    expect(parsed.success).toBe(false);
  });

  it('refuses an unknown motion property', () => {
    const parsed = VisualRenderSpecSchema.safeParse(
      spec({
        durationMs: 1_000,
        fps: 8,
        tracks: [{ id: 'box', keyframes: [{ at: 0, jump: 3 }, { at: 1 }] }],
      })
    );
    expect(parsed.success).toBe(false);
  });
});
