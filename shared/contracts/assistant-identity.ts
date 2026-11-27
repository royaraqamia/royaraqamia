import { z } from 'zod';

/**
 * The assistant's identity, as the member sets it (ADR-0224).
 *
 * One private row per member: what their copy is called, which mark it wears and
 * which tone it answers in. Nothing here is public — the row is owner-only, and a
 * shared surface draws the site's neutral «المساعد» rather than a member's name.
 *
 * The name is *data* handed to the prompt inside a quoted sentence, never an
 * instruction, so it is bounded before it can reach a model: letters (Arabic or
 * Latin), ASCII digits and single spaces. No punctuation, no newlines, no
 * Arabic-Indic or Persian digits (ADR-0054's rule, applied to stored content).
 */

export const ASSISTANT_NAME_MAX = 24;
export const ASSISTANT_NOTE_MAX = 120;
export const ASSISTANT_AVATAR_VARIANTS = 12;

/** The deployment's name for the assistant when the member has set none. */
export const ASSISTANT_DEFAULT_NAME = 'نور';

/**
 * The column that turns one assistant into a roster later. One row per member
 * today; a second assistant is a new key, not a new table.
 */
export const ASSISTANT_KEY_DEFAULT = 'default';

export const AssistantToneSchema = z.enum(['default', 'concise', 'warm', 'formal']);
export type AssistantTone = z.infer<typeof AssistantToneSchema>;

/**
 * The site's own names. A member's copy may not answer as the site, and the
 * reservation is checked here rather than in the form so the API refuses it too.
 */
const RESERVED_ASSISTANT_NAMES: readonly string[] = ['رؤية', 'رؤية رقمية', 'الإدارة', 'الدعم'];

/**
 * A display name the member owns. `trim()` runs first, so a padded value is the
 * name the member meant; everything after it is refused rather than repaired,
 * because a silently rewritten name is not the one on their screen.
 */
export const AssistantNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(ASSISTANT_NAME_MAX)
  .regex(
    /^[\u0621-\u063F\u0641-\u064A\u0671-\u06D3a-zA-Z0-9 ]+$/,
    'الاسم يقبل الحروف والأرقام والمسافة فقط'
  )
  .refine((value) => !/\s{2,}/.test(value), 'الاسم لا يقبل مسافتين متتاليتين')
  .refine((value) => !RESERVED_ASSISTANT_NAMES.includes(value), 'هذا الاسم محجوز');

/** What the member sends: every field, because the write replaces the row. */
export const AssistantIdentityInputSchema = z.object({
  /** `null` restores the deployment's name without forgetting the other fields. */
  name: AssistantNameSchema.nullable(),
  avatarVariant: z.number().int().min(1).max(ASSISTANT_AVATAR_VARIANTS).nullable(),
  tone: AssistantToneSchema,
  note: z.string().trim().max(ASSISTANT_NOTE_MAX).nullable(),
});

export type AssistantIdentityInput = z.infer<typeof AssistantIdentityInputSchema>;

/** What every surface reads. `name` is resolved, so no caller has to branch. */
export const AssistantIdentitySchema = z.object({
  name: z.string(),
  customName: z.string().nullable(),
  avatarVariant: z.number().int().nullable(),
  tone: AssistantToneSchema,
  note: z.string().nullable(),
  updatedAt: z.string().nullable(),
});

export type AssistantIdentity = z.infer<typeof AssistantIdentitySchema>;

/** What the page reads, and what a save answers. */
export const AssistantIdentityResultSchema = z.object({
  success: z.boolean(),
  identity: AssistantIdentitySchema.optional(),
  error: z.string().optional(),
});

export type AssistantIdentityResult = z.infer<typeof AssistantIdentityResultSchema>;

/** The identity a member without a row gets: the default name, nothing set. */
export const DEFAULT_ASSISTANT_IDENTITY: AssistantIdentity = {
  name: ASSISTANT_DEFAULT_NAME,
  customName: null,
  avatarVariant: null,
  tone: 'default',
  note: null,
  updatedAt: null,
};
