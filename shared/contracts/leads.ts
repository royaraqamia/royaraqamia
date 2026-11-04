import { z } from 'zod';

/**
 * The answer the three public lead routes give (#929).
 *
 * A lead form submits through `POST /api/training/applications`,
 * `POST /api/project-requests` or `POST /api/retainers`. All three answer the
 * same envelope: `success` plus the server-minted `referenceCode` the visitor
 * quotes, or a sentence of refusal. The app's Outbox decodes that envelope, so
 * a replayed submission can write the reference code to the form's receipt
 * instead of guessing from a status.
 *
 * `fieldErrors` travels with a refusal but is deliberately absent here: the
 * app validates the same rules before it queues, and a queued submission was
 * already valid. A drift between the two is `error`'s sentence, not a map the
 * screen re-renders field by field.
 */
export const LeadSubmitResponseSchema = z.object({
  success: z.boolean(),
  referenceCode: z.string().optional(),
  error: z.string().optional(),
});

export type LeadSubmitResponse = z.infer<typeof LeadSubmitResponseSchema>;
