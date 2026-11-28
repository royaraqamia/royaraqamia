import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { SaxesParser, type SaxesTagPlain } from 'saxes';
import sharp from 'sharp';

import { sanitizeVisualSvg, svgElementIds } from '@/backend/services/chat/visual-sanitize';

import {
  VISUAL_RENDER_HEIGHT,
  VISUAL_RENDER_MAX_BYTES,
  VISUAL_RENDER_MAX_MS,
  VISUAL_RENDER_WIDTH,
  VisualRenderSpecSchema,
  visualAnimationFrames,
  type VisualAnimation,
  type VisualRenderSpec,
} from '@/shared/contracts/visual';

/**
 * A bounded drawing becomes a bounded MP4 on the origin (ADR-0215 amendment).
 *
 * The page still draws the SVG; this is the second output, and it is data, not
 * code: every frame is rebuilt from the same sanitized SVG and the motion
 * contract's numbers. Sharp paints frames, ffmpeg muxes them, and the whole pass
 * is bounded by frame count, pixel size, wall clock and byte size in this
 * module — never in the prompt.
 */

export interface VisualClip {
  bytes: Uint8Array;
  frames: number;
  durationMs: number;
  fps: number;
  width: number;
  height: number;
  /** The measured wall time of the frame-to-MP4 pass. */
  renderMs: number;
}

export type VisualRenderOutcome = { ok: true; clip: VisualClip } | { ok: false; reason: string };

export interface VisualRenderDeps {
  /** The binary on PATH in the origin image; a test may point at its own. */
  ffmpegPath?: string;
  /** A hard wall-clock ceiling, kept as a seam so a test can lower it. */
  maxMs?: number;
}

interface Motion {
  transform: string | null;
  opacity: number | null;
}

type Keyframe = VisualAnimation['tracks'][number]['keyframes'][number];

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function escapeText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * One property's values over time. A keyframe that omits a property simply does
 * not vote for it, so a track can move x for the whole clip and fade only at the
 * end without repeating every value.
 */
function interpolate(
  keyframes: Keyframe[],
  property: keyof Omit<Keyframe, 'at'>,
  t: number
): number | null {
  const points = keyframes
    .filter((frame) => frame[property] !== undefined)
    .map((frame) => ({ at: frame.at, value: frame[property] as number }))
    .sort((a, b) => a.at - b.at);
  if (points.length === 0) return null;
  if (points.length === 1) return points[0]!.value;

  const first = points[0]!;
  const last = points[points.length - 1]!;
  if (t <= first.at) return first.value;
  if (t >= last.at) return last.value;

  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1]!;
    const to = points[index]!;
    if (t <= to.at) {
      const span = to.at - from.at;
      if (span <= 0) return to.value;
      const ratio = (t - from.at) / span;
      return from.value + (to.value - from.value) * ratio;
    }
  }
  return last.value;
}

function motionAt(track: VisualAnimation['tracks'][number], t: number): Motion {
  const x = interpolate(track.keyframes, 'x', t) ?? 0;
  const y = interpolate(track.keyframes, 'y', t) ?? 0;
  const scale = interpolate(track.keyframes, 'scale', t);
  const rotate = interpolate(track.keyframes, 'rotate', t);
  const opacity = interpolate(track.keyframes, 'opacity', t);

  const parts: string[] = [];
  if (x !== 0 || y !== 0) parts.push(`translate(${round(x)} ${round(y)})`);
  if (rotate !== null && rotate !== 0) parts.push(`rotate(${round(rotate)})`);
  if (scale !== null && scale !== 1) parts.push(`scale(${round(scale)})`);

  return {
    transform: parts.length > 0 ? parts.join(' ') : null,
    opacity,
  };
}

/** Rebuild the sanitized SVG with this frame's transform and opacity applied. */
export function animateSvgFrame(svg: string, animation: VisualAnimation, t: number): string {
  const motions = new Map<string, Motion>();
  for (const track of animation.tracks) {
    const motion = motionAt(track, t);
    if (motion.transform !== null || motion.opacity !== null) motions.set(track.id, motion);
  }
  if (motions.size === 0) return svg;

  const out: string[] = [];
  const parser = new SaxesParser();
  parser.on('opentag', (tag: SaxesTagPlain) => {
    const attrs = new Map<string, string>(
      Object.entries(tag.attributes).map(([key, value]) => [key, String(value)])
    );
    const id = attrs.get('id');
    const motion = id ? motions.get(id) : undefined;
    if (motion?.transform) {
      const existing = attrs.get('transform');
      attrs.set('transform', existing ? `${motion.transform} ${existing}` : motion.transform);
    }
    if (motion?.opacity !== null && motion?.opacity !== undefined) {
      attrs.set('opacity', String(round(motion.opacity)));
    }
    const serialized = [...attrs.entries()]
      .map(([key, value]) => `${key}="${escapeAttr(value)}"`)
      .join(' ');
    out.push(`<${tag.name}${serialized ? ` ${serialized}` : ''}>`);
  });
  parser.on('text', (text: string) => out.push(escapeText(text)));
  parser.on('closetag', (tag: SaxesTagPlain) => out.push(`</${tag.name}>`));
  parser.on('error', () => {
    // The input is already sanitized; a parse error means refuse, not emit half.
    out.length = 0;
  });

  try {
    parser.write(svg).close();
  } catch {
    return '';
  }
  return out.join('');
}

async function muxFrames(
  framesDirectory: string,
  fps: number,
  ffmpegPath: string,
  maxMs: number
): Promise<Uint8Array> {
  const outputPath = join(framesDirectory, 'clip.mp4');
  const args = [
    '-y',
    '-loglevel',
    'error',
    '-framerate',
    String(fps),
    '-start_number',
    '0',
    '-i',
    join(framesDirectory, 'frame-%03d.png'),
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-preset',
    'veryfast',
    '-crf',
    '28',
    '-movflags',
    '+faststart',
    outputPath,
  ];

  await new Promise<void>((resolve, reject) => {
    const child = spawn(ffmpegPath, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`ffmpeg exceeded ${maxMs} ms`));
    }, maxMs);

    child.stderr.on('data', (chunk: Buffer) => {
      if (stderr.length < 8_000) stderr += chunk.toString('utf8');
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited ${code}: ${stderr.trim().slice(0, 500)}`));
    });
  });

  return new Uint8Array(await readFile(outputPath));
}

export interface VisualRenderer {
  render(spec: VisualRenderSpec): Promise<VisualRenderOutcome>;
}

export function createVisualRender({
  ffmpegPath = 'ffmpeg',
  maxMs = VISUAL_RENDER_MAX_MS,
}: VisualRenderDeps = {}): VisualRenderer {
  return {
    async render(spec) {
      const parsed = VisualRenderSpecSchema.safeParse(spec);
      if (!parsed.success || !parsed.data.animation) {
        return { ok: false, reason: 'spec' };
      }
      // Defense in depth: the queue row is a trust boundary too, so the render
      // seam re-runs the same whitelist the tool ran before the row existed.
      const svg = sanitizeVisualSvg(parsed.data.svg);
      if (!svg) return { ok: false, reason: 'svg' };
      const ids = svgElementIds(svg);
      const animation = {
        ...parsed.data.animation,
        tracks: parsed.data.animation.tracks.filter((track) => ids.has(track.id)),
      };
      if (animation.tracks.length === 0) return { ok: false, reason: 'track' };
      const frames = visualAnimationFrames(animation.durationMs, animation.fps);
      const started = process.hrtime.bigint();

      let directory: string | null = null;
      try {
        directory = await mkdtemp(join(tmpdir(), 'visual-render-'));
        for (let index = 0; index < frames; index += 1) {
          const t = frames === 1 ? 0 : index / frames;
          const frameSvg = animateSvgFrame(svg, animation, t);
          if (!frameSvg) return { ok: false, reason: 'frame' };
          const png = await sharp(Buffer.from(frameSvg))
            .resize(VISUAL_RENDER_WIDTH, VISUAL_RENDER_HEIGHT, {
              fit: 'contain',
              background: { r: 255, g: 255, b: 255, alpha: 1 },
            })
            .flatten({ background: '#ffffff' })
            .png()
            .toBuffer();
          await writeFile(join(directory, `frame-${String(index).padStart(3, '0')}.png`), png);
        }

        const bytes = await muxFrames(directory, animation.fps, ffmpegPath, maxMs);
        if (bytes.byteLength > VISUAL_RENDER_MAX_BYTES) {
          return { ok: false, reason: 'size' };
        }
        const renderMs = Number(process.hrtime.bigint() - started) / 1_000_000;
        return {
          ok: true,
          clip: {
            bytes,
            frames,
            durationMs: animation.durationMs,
            fps: animation.fps,
            width: VISUAL_RENDER_WIDTH,
            height: VISUAL_RENDER_HEIGHT,
            renderMs,
          },
        };
      } finally {
        if (directory) await rm(directory, { recursive: true, force: true });
      }
    },
  };
}
