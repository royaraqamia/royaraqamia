import { z } from 'zod';

/**
 * A visual the assistant drew in code (ADR-0215).
 *
 * The model writes a small SVG; the page turns it into a raster image at display
 * time. The deployment has no browser, no ffmpeg and no GPU on its Node service,
 * so the conversion belongs to the client that already has a canvas.
 */
export const VISUAL_SVG_MAX_CHARS = 12_000;
export const VISUAL_CAPTION_MAX_CHARS = 160;

/**
 * The motion a still drawing may carry (ADR-0215 amendment, #1776).
 *
 * The model names an element `id` in the SVG it already wrote and declares a
 * few timed keyframes for it. Nothing here is code: every value is a bounded
 * number, so `visual-sanitize.ts` keeps owning the SVG and this contract owns
 * the motion. The origin renders it to MP4; the page still draws the SVG.
 */
export const VISUAL_ANIMATION_MIN_DURATION_MS = 400;
export const VISUAL_ANIMATION_MAX_DURATION_MS = 6_000;
export const VISUAL_ANIMATION_MIN_FPS = 4;
export const VISUAL_ANIMATION_MAX_FPS = 12;
export const VISUAL_ANIMATION_MAX_FRAMES = 72;
export const VISUAL_ANIMATION_MAX_TRACKS = 8;
export const VISUAL_ANIMATION_MAX_KEYFRAMES = 12;

/** The one size every rendered clip is drawn at, so the bound is a constant. */
export const VISUAL_RENDER_WIDTH = 640;
export const VISUAL_RENDER_HEIGHT = 360;
/** A finished clip above this is refused rather than streamed to a phone. */
export const VISUAL_RENDER_MAX_BYTES = 8 * 1024 * 1024;
/** The whole frame-to-MP4 pass is killed at this ceiling. */
export const VISUAL_RENDER_MAX_MS = 30_000;

/** The follow-up line the finished clip arrives under. */
export const VISUAL_CLIP_READY = 'هذه نسخة متحركة من الرسم.';

const VisualKeyframeSchema = z.strictObject({
  /** Where in the clip this keyframe sits: 0 is the start, 1 the end. */
  at: z.number().min(0).max(1),
  x: z.number().min(-480).max(480).optional(),
  y: z.number().min(-270).max(270).optional(),
  scale: z.number().min(0.1).max(4).optional(),
  rotate: z.number().min(-360).max(360).optional(),
  opacity: z.number().min(0).max(1).optional(),
});

const VisualTrackSchema = z.strictObject({
  /** An `id` that already exists in the sanitized SVG. */
  id: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[A-Za-z_][A-Za-z0-9_.:-]*$/, 'معرّف العنصر غير صالح'),
  keyframes: z
    .array(VisualKeyframeSchema)
    .min(2)
    .max(VISUAL_ANIMATION_MAX_KEYFRAMES, 'عدد الإطارات المفتاحية كبير جداً'),
});

/** How many frames a clip of this length produces, clamped to the ceiling. */
export function visualAnimationFrames(durationMs: number, fps: number): number {
  const raw = Math.round((durationMs / 1000) * fps);
  return Math.max(1, Math.min(VISUAL_ANIMATION_MAX_FRAMES, raw));
}

export const VisualAnimationSchema = z
  .strictObject({
    durationMs: z
      .number()
      .int()
      .min(VISUAL_ANIMATION_MIN_DURATION_MS, 'المدة قصيرة جداً')
      .max(VISUAL_ANIMATION_MAX_DURATION_MS, 'المدة طويلة جداً'),
    fps: z
      .number()
      .int()
      .min(VISUAL_ANIMATION_MIN_FPS, 'معدل الإطارات منخفض جداً')
      .max(VISUAL_ANIMATION_MAX_FPS, 'معدل الإطارات مرتفع جداً'),
    tracks: z.array(VisualTrackSchema).min(1).max(VISUAL_ANIMATION_MAX_TRACKS),
  })
  .superRefine((value, ctx) => {
    const frames = Math.round((value.durationMs / 1000) * value.fps);
    if (frames > VISUAL_ANIMATION_MAX_FRAMES) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'الرسم المتحرك طويل جداً',
        path: ['durationMs'],
      });
    }
  });

export type VisualAnimation = z.infer<typeof VisualAnimationSchema>;

export const VisualSpecSchema = z.strictObject({
  /** Sanitized on the server before it reaches any client or the stored row. */
  svg: z.string().min(1, 'الرسم فارغ').max(VISUAL_SVG_MAX_CHARS, 'الرسم طويل جداً'),
  caption: z.string().trim().max(VISUAL_CAPTION_MAX_CHARS, 'الوصف طويل جداً').optional(),
});

export type VisualSpec = z.infer<typeof VisualSpecSchema>;

/**
 * The drawing a turn may ask the origin to render: the still spec plus optional
 * motion. It is deliberately outside the generated app contract — the still
 * `VisualSpec` is what both clients decode, and motion only ever travels to the
 * render queue, never into a stored message the Kotlin side reads.
 */
export const VisualRenderSpecSchema = VisualSpecSchema.extend({
  animation: VisualAnimationSchema.optional(),
}).strict();

export type VisualRenderSpec = z.infer<typeof VisualRenderSpecSchema>;

/** The one sentence the model hears when a visual could not be drawn. */
export const VISUAL_UNAVAILABLE = 'تعذّر عرض الرسم الآن.';
