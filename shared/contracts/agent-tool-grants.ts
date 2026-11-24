import { z } from 'zod';

/**
 * The member's per-tool trust (ADR-0180 decisions 2, 3 and 4, #1438).
 *
 * A tier-1 tool — reversible, the member's own data, no third party — may run
 * inside a turn once the member grants it, after they have seen it run at least
 * once. The settings surface lists the live grants and the tools that are ready
 * to be granted; the same rows are drawn in the apps sheet.
 *
 * The wire shape is the row and its label, nothing else: the tier, the executor
 * and the audit stay server-side, so a client cannot widen what a grant means.
 */

/** One live grant, with the tool's label in the member's language. */
export const AgentToolGrantSchema = z.object({
  id: z.string(),
  toolId: z.string(),
  label: z.string(),
  grantedAt: z.string(),
  lastUsedAt: z.string().nullable(),
});

export type AgentToolGrant = z.infer<typeof AgentToolGrantSchema>;

/**
 * A tool the member may grant now: tier 1, already run at least once for them,
 * and not already granted.
 */
export const AgentGrantableToolSchema = z.object({
  toolId: z.string(),
  label: z.string(),
});

export type AgentGrantableTool = z.infer<typeof AgentGrantableToolSchema>;

/** What the settings surface reads: the live grants and what may be granted. */
export const AgentToolGrantListResultSchema = z.object({
  success: z.boolean(),
  grants: z.array(AgentToolGrantSchema).optional(),
  grantable: z.array(AgentGrantableToolSchema).optional(),
  error: z.string().optional(),
});

export type AgentToolGrantListResult = z.infer<typeof AgentToolGrantListResultSchema>;

/** What a grant sends: the agent tool's own name. */
export const AgentToolGrantRequestSchema = z.object({
  toolId: z.string().trim().min(1).max(120),
});

export type AgentToolGrantRequest = z.infer<typeof AgentToolGrantRequestSchema>;

/** What revoking or granting answers. */
export const AgentToolGrantResultSchema = z.object({
  success: z.boolean(),
  grant: AgentToolGrantSchema.nullable().optional(),
  error: z.string().optional(),
});

export type AgentToolGrantResult = z.infer<typeof AgentToolGrantResultSchema>;
