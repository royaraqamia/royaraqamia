import { z } from 'zod';

/**
 * What the assistant remembers, as the memory page reads and changes it
 * (ADR-0182 decision 6, #1428).
 *
 * One contract for both clients, like every other account route: the Zod schema
 * is the wire shape, so the app's Kotlin data class is generated from the same
 * declaration the site reads (ADR-0098). A field renamed here is a compile error
 * in `AgentMemoryContracts.kt` rather than a `null` on a screen.
 *
 * The fact is the row, and only the row: no embedding, no score, no model. What
 * the member can see is what they can edit and delete (`agent_memories`), which
 * is the promise the page has to keep — a fact rendered from a second table
 * would be a fact with no delete button.
 */

export const AgentMemoryScopeSchema = z.enum(['account', 'product', 'thread']);

export const AgentMemoryKindSchema = z.enum(['fact', 'preference', 'health', 'legal', 'financial']);

export type AgentMemoryKind = z.infer<typeof AgentMemoryKindSchema>;
export type AgentMemoryScope = z.infer<typeof AgentMemoryScopeSchema>;

export const AgentMemoryFactSchema = z.object({
  id: z.string(),
  scope: AgentMemoryScopeSchema,
  /** Set exactly when `scope` is `product`. */
  product: z.string().nullable(),
  /** Set exactly when `scope` is `thread`. */
  threadId: z.string().nullable(),
  kind: AgentMemoryKindSchema,
  text: z.string(),
  /** The turn it was written from, when it was not typed into the page. */
  sourceTurnId: z.string().nullable(),
  confidence: z.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type AgentMemoryFact = z.infer<typeof AgentMemoryFactSchema>;

/**
 * The member's three switches, one per scope. `false` means the assistant
 * neither saves there nor recalls from there; the facts already saved stay on
 * the page, because a fact the member cannot see is a fact they cannot delete.
 */
export const AgentMemorySettingsSchema = z.object({
  account: z.boolean(),
  product: z.boolean(),
  thread: z.boolean(),
});

export type AgentMemorySettings = z.infer<typeof AgentMemorySettingsSchema>;

/** What the page reads: the facts and the switches, or why it could not. */
export const AgentMemoryListResultSchema = z.object({
  success: z.boolean(),
  facts: z.array(AgentMemoryFactSchema).optional(),
  settings: AgentMemorySettingsSchema.optional(),
  error: z.string().optional(),
});

export type AgentMemoryListResult = z.infer<typeof AgentMemoryListResultSchema>;

/**
 * What a write answers. `forgot` is the count a conversation's forget reports,
 * so "there was nothing to forget" is distinguishable from "it did not work".
 */
export const AgentMemoryActionResultSchema = z.object({
  success: z.boolean(),
  forgot: z.number().optional(),
  error: z.string().optional(),
});

export type AgentMemoryActionResult = z.infer<typeof AgentMemoryActionResultSchema>;

/** What an edit sends: the text, or the kind, or both. */
export const AgentMemoryEditSchema = z
  .object({
    text: z.string().min(1).max(500).optional(),
    kind: AgentMemoryKindSchema.optional(),
  })
  .refine((value) => value.text !== undefined || value.kind !== undefined, {
    message: 'nothing to change',
  });

export type AgentMemoryEdit = z.infer<typeof AgentMemoryEditSchema>;

/** What a switch sends: the scopes it names, and only those. */
export const AgentMemorySettingsPatchSchema = z
  .object({
    account: z.boolean().optional(),
    product: z.boolean().optional(),
    thread: z.boolean().optional(),
  })
  .refine(
    (value) =>
      value.account !== undefined || value.product !== undefined || value.thread !== undefined,
    { message: 'nothing to change' }
  );

export type AgentMemorySettingsPatch = z.infer<typeof AgentMemorySettingsPatchSchema>;
