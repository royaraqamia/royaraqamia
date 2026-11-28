import { spawnSync } from 'node:child_process';

import { describe, expect, it } from 'vitest';

import { animateSvgFrame, createVisualRender } from '@/backend/services/chat/visual-render';
import { svgElementIds } from '@/backend/services/chat/visual-sanitize';
import {
  VISUAL_RENDER_HEIGHT,
  VISUAL_RENDER_MAX_MS,
  VISUAL_RENDER_WIDTH,
  VisualRenderSpecSchema,
} from '@/shared/contracts/visual';

const FFMPEG = process.env.VISUAL_TEST_FFMPEG ?? 'ffmpeg';
const hasFfmpeg = spawnSync(FFMPEG, ['-version'], { stdio: 'ignore' }).status === 0;

const svg =
  '<svg viewBox="0 0 200 120"><rect id="box" width="40" height="40" fill="#0af"></rect></svg>';

describe('visual motion renderer (ADR-0215 amendment)', () => {
  it('keeps only ids the sanitizer kept', () => {
    expect(svgElementIds(svg).has('box')).toBe(true);
    expect(svgElementIds(svg).has('missing')).toBe(false);
  });

  it('applies this frame keyframe to the named element', () => {
    const parsed = VisualRenderSpecSchema.parse({
      svg,
      animation: {
        durationMs: 1_000,
        fps: 10,
        tracks: [
          {
            id: 'box',
            keyframes: [
              { at: 0, x: 0 },
              { at: 1, x: 100 },
            ],
          },
        ],
      },
    });
    const frame = animateSvgFrame(parsed.svg, parsed.animation!, 0.5);
    expect(frame).toContain('transform="translate(50 0)"');
    expect(frame).toContain('id="box"');
    // The untargeted rest of the drawing is untouched.
    expect(frame).toContain('fill="#0af"');
  });

  it('refuses a spec with no animation', async () => {
    const outcome = await createVisualRender({ ffmpegPath: FFMPEG }).render(
      VisualRenderSpecSchema.parse({ svg })
    );
    expect(outcome.ok).toBe(false);
  });

  describe.skipIf(!hasFfmpeg)('with ffmpeg on the box', () => {
    it('turns a bounded animation into an MP4 within the caps', async () => {
      const spec = VisualRenderSpecSchema.parse({
        svg,
        caption: 'مربع يتحرك',
        animation: {
          durationMs: 800,
          fps: 10,
          tracks: [
            {
              id: 'box',
              keyframes: [
                { at: 0, x: 0, opacity: 1 },
                { at: 1, x: 120, opacity: 0.4 },
              ],
            },
          ],
        },
      });

      const outcome = await createVisualRender({ ffmpegPath: FFMPEG }).render(spec);
      expect(outcome.ok).toBe(true);
      if (!outcome.ok) return;

      const { clip } = outcome;
      expect(clip.frames).toBe(8);
      expect(clip.width).toBe(VISUAL_RENDER_WIDTH);
      expect(clip.height).toBe(VISUAL_RENDER_HEIGHT);
      expect(clip.renderMs).toBeLessThan(VISUAL_RENDER_MAX_MS);
      // An MP4's first box is `ftyp`, at byte 4.
      expect(Buffer.from(clip.bytes.subarray(4, 8)).toString('ascii')).toBe('ftyp');
      expect(clip.bytes.byteLength).toBeGreaterThan(0);
      if (process.env.VISUAL_RENDER_REPORT) {
        process.stdout.write(
          `visual-render frames=${clip.frames} bytes=${clip.bytes.byteLength} ms=${clip.renderMs}\n`
        );
      }
    }, 60_000);

    it('renders the maximum frame budget inside every cap', async () => {
      const spec = VisualRenderSpecSchema.parse({
        svg,
        animation: {
          durationMs: 6_000,
          fps: 12,
          tracks: [
            {
              id: 'box',
              keyframes: [
                { at: 0, x: 0, y: 0, opacity: 1 },
                { at: 1, x: 120, y: 60, opacity: 0.5 },
              ],
            },
          ],
        },
      });

      const outcome = await createVisualRender({ ffmpegPath: FFMPEG }).render(spec);
      expect(outcome.ok).toBe(true);
      if (!outcome.ok) return;

      expect(outcome.clip.frames).toBe(72);
      expect(outcome.clip.renderMs).toBeLessThan(VISUAL_RENDER_MAX_MS);
      expect(outcome.clip.bytes.byteLength).toBeLessThanOrEqual(8 * 1024 * 1024);
      if (process.env.VISUAL_RENDER_REPORT) {
        process.stdout.write(
          `visual-render-max frames=${outcome.clip.frames} bytes=${outcome.clip.bytes.byteLength} ms=${outcome.clip.renderMs}\n`
        );
      }
    }, 120_000);
  });
});
