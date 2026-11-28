/**
 * The assistant identity's values, apart from its schema (ADR-0229).
 *
 * The contract module imports zod, and a client chunk that only needs the
 * deployment's default name must not pay for a validator: `/community/explore`
 * grew by a schema it never runs the moment the root provider read the default
 * from the contract itself. These are the same values the schema enforces — the
 * contract re-exports them, so nothing here is a second source.
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

export const ASSISTANT_VOICES = ['feminine', 'masculine'] as const;
export type AssistantVoice = (typeof ASSISTANT_VOICES)[number];

/** The shipped wording («نور») is feminine, so that is the default. */
export const ASSISTANT_DEFAULT_VOICE: AssistantVoice = 'feminine';
