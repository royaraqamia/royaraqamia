import { z } from 'zod';

/**
 * The keyboard's one network action (ADR-0220).
 *
 * A rewrite is a single bounded call made only when the member taps the button.
 * The body carries the current composing text and nothing else: no history, no
 * clipboard, no prediction context, no tool declarations and no memory. Both
 * ceilings and the timeout live in `MAX_INPUT_CHARS` / `MAX_OUTPUT_CHARS` /
 * `REWRITE_TIMEOUT_MS` so the server enforces them before and after the model,
 * not as a request to the model.
 */
export const MAX_REWRITE_INPUT_CHARS = 280;
export const MAX_REWRITE_OUTPUT_CHARS = 280;
export const REWRITE_TIMEOUT_MS = 5_000;

/** The scope a minted IME credential carries. Nothing else is accepted. */
export const KEYBOARD_REWRITE_SCOPE = 'keyboard.rewrite' as const;

export const KeyboardRewriteRequestSchema = z.object({
  text: z
    .string()
    .trim()
    .min(1, 'لا يوجد نص لإعادة صياغته.')
    .max(MAX_REWRITE_INPUT_CHARS, 'النص طويل جدًا لإعادة صياغته.'),
});

export type KeyboardRewriteRequest = z.infer<typeof KeyboardRewriteRequestSchema>;

/** The consent tap is an explicit act, not a side effect of opening settings. */
export const KeyboardConsentSchema = z.object({
  consent: z.literal(true),
});

export type KeyboardConsent = z.infer<typeof KeyboardConsentSchema>;

/** One short Arabic suggestion. `error` is a whole sentence and never vendor text. */
export type KeyboardRewriteResponse =
  { success: true; suggestion: string } | { success: false; error: string };

/** The response to a successful consent tap: a token, short-lived and rewrite-only. */
export type KeyboardCredentialResponse = {
  success: true;
  token: string;
  expiresIn: number;
  scope: typeof KEYBOARD_REWRITE_SCOPE;
};
