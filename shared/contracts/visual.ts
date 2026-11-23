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

export const VisualSpecSchema = z.strictObject({
  /** Sanitized on the server before it reaches any client or the stored row. */
  svg: z.string().min(1, 'الرسم فارغ').max(VISUAL_SVG_MAX_CHARS, 'الرسم طويل جداً'),
  caption: z.string().trim().max(VISUAL_CAPTION_MAX_CHARS, 'الوصف طويل جداً').optional(),
});

export type VisualSpec = z.infer<typeof VisualSpecSchema>;

/** The one sentence the model hears when a visual could not be drawn. */
export const VISUAL_UNAVAILABLE = 'تعذّر عرض الرسم الآن.';
