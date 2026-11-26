/**
 * Wire shapes for the coding-agent capability (ADR-0219).
 *
 * The chat service is the control plane; an isolated runner executes code. Both
 * sides decode the same schemas so the runner cannot invent a step, a status or
 * a spending limit. The runner speaks to the control plane over HTTPS with a
 * short-lived, task-scoped token — never with a member credential.
 */

import { z } from 'zod';

export const CODING_TASK_MODES = ['plan', 'edit', 'full'] as const;
export type CodingTaskMode = (typeof CODING_TASK_MODES)[number];

export const CODING_TASK_STATUSES = [
  'queued',
  'running',
  'awaiting_plan',
  'awaiting_push',
  'completed',
  'failed',
  'cancelled',
] as const;
export type CodingTaskStatus = (typeof CODING_TASK_STATUSES)[number];

export const CODING_STEP_KINDS = [
  'plan',
  'edit',
  'test',
  'commit',
  'push',
  'pull_request',
] as const;
export type CodingStepKind = (typeof CODING_STEP_KINDS)[number];

export const CODING_STEP_STATUSES = [
  'proposed',
  'running',
  'applied',
  'rejected',
  'failed',
] as const;
export type CodingStepStatus = (typeof CODING_STEP_STATUSES)[number];

/** Caps are per plan, per month and per task. Both plans use DeepSeek V4.1 Flash. */
export interface CodingPlanCaps {
  tasksPerMonth: number;
  runnerMinutes: number;
  maxInputTokens: number;
  maxOutputTokens: number;
}

export const CODING_PLAN_CAPS: Record<'free' | 'pro', CodingPlanCaps> = {
  free: {
    tasksPerMonth: 3,
    runnerMinutes: 15,
    maxInputTokens: 200_000,
    maxOutputTokens: 30_000,
  },
  pro: {
    tasksPerMonth: 40,
    runnerMinutes: 30,
    maxInputTokens: 500_000,
    maxOutputTokens: 50_000,
  },
};

/** A GitHub repository the member connected through the GitHub App. */
export const CodingRepoInputSchema = z.strictObject({
  owner: z.string().min(1).max(100),
  name: z.string().min(1).max(100),
});
export type CodingRepoInput = z.infer<typeof CodingRepoInputSchema>;

export const CreateCodingTaskSchema = z.strictObject({
  workspaceId: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
  instruction: z.string().trim().min(1).max(20_000),
  mode: z.enum(CODING_TASK_MODES),
  baseBranch: z.string().trim().min(1).max(200).default('main'),
});
export type CreateCodingTaskInput = z.infer<typeof CreateCodingTaskSchema>;

export const DecideCodingStepSchema = z.strictObject({
  decision: z.enum(['approve', 'reject']),
});
export type DecideCodingStepInput = z.infer<typeof DecideCodingStepSchema>;

/** Cursor: `<created_at>|<id>`, capped to 100 by the controller. */
export const CodingTaskListQuerySchema = z.strictObject({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().max(200).optional(),
});
export type CodingTaskListQuery = z.infer<typeof CodingTaskListQuerySchema>;

export const CodingWorkspaceDtoSchema = z.strictObject({
  id: z.string().uuid(),
  repoOwner: z.string(),
  repoName: z.string(),
  defaultBranch: z.string(),
  /** One-time PR that installs the workflow file; null when already installed. */
  bootstrapPrUrl: z.string().nullable(),
  createdAt: z.string(),
});
export type CodingWorkspaceDto = z.infer<typeof CodingWorkspaceDtoSchema>;

/** A repository the member's GitHub App installation can reach, not yet a workspace. */
export const CodingAvailableRepoDtoSchema = z.strictObject({
  owner: z.string(),
  name: z.string(),
  fullName: z.string(),
  defaultBranch: z.string(),
});
export type CodingAvailableRepoDto = z.infer<typeof CodingAvailableRepoDtoSchema>;

export const CodingStepDtoSchema = z.strictObject({
  id: z.string().uuid(),
  kind: z.enum(CODING_STEP_KINDS),
  status: z.enum(CODING_STEP_STATUSES),
  summary: z.string(),
  diff: z.string().nullable(),
  createdAt: z.string(),
});
export type CodingStepDto = z.infer<typeof CodingStepDtoSchema>;

export const CodingTaskDtoSchema = z.strictObject({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  title: z.string(),
  instruction: z.string(),
  mode: z.enum(CODING_TASK_MODES),
  status: z.enum(CODING_TASK_STATUSES),
  branch: z.string().nullable(),
  pullRequestUrl: z.string().nullable(),
  summary: z.string(),
  failureCode: z.string().nullable(),
  steps: z.array(CodingStepDtoSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type CodingTaskDto = z.infer<typeof CodingTaskDtoSchema>;

export const CodingTaskPageSchema = z.strictObject({
  tasks: z.array(CodingTaskDtoSchema),
  nextCursor: z.string().nullable(),
});
export type CodingTaskPage = z.infer<typeof CodingTaskPageSchema>;

/** What the runner needs to start. No member credential crosses this boundary. */
export const CodingRunnerTaskSchema = z.strictObject({
  taskId: z.string().uuid(),
  repoOwner: z.string(),
  repoName: z.string(),
  baseBranch: z.string(),
  branch: z.string().min(1),
  instruction: z.string(),
  mode: z.enum(CODING_TASK_MODES),
  caps: z.strictObject({
    runnerMinutes: z.number().int().positive(),
    maxInputTokens: z.number().int().positive(),
    maxOutputTokens: z.number().int().positive(),
  }),
  callbackUrl: z.string().url(),
  /** Raw short-lived bearer token. The control plane stores only its hash. */
  callbackToken: z.string().min(20),
  /** Short-lived installation token used only for the final PR handoff. */
  handoffToken: z.string().min(20),
  runnerUrl: z.string().url(),
});
export type CodingRunnerTask = z.infer<typeof CodingRunnerTaskSchema>;

/** Progress frames the runner posts to the control plane. */
export const CodingRunnerUpdateSchema = z.strictObject({
  kind: z.enum(CODING_STEP_KINDS),
  status: z.enum(['running', 'applied', 'failed']),
  summary: z.string().max(20_000),
  diff: z.string().max(200_000).nullable(),
  failureCode: z.string().max(80).nullable(),
  inputTokens: z.number().int().nonnegative().nullable(),
  outputTokens: z.number().int().nonnegative().nullable(),
});
export type CodingRunnerUpdate = z.infer<typeof CodingRunnerUpdateSchema>;

/** The runner keeps the conversation; the control plane owns the model key. */
export const CodingRunnerLlmRequestSchema = z.strictObject({
  messages: z
    .array(
      z.strictObject({
        role: z.enum(['system', 'user', 'assistant', 'tool']),
        content: z.string().max(200_000),
        tool_call_id: z.string().optional(),
        tool_calls: z
          .array(
            z.strictObject({
              id: z.string(),
              type: z.literal('function'),
              function: z.strictObject({ name: z.string(), arguments: z.string() }),
            })
          )
          .optional(),
      })
    )
    .min(1)
    .max(200),
  tools: z.array(z.record(z.string(), z.unknown())).max(20).optional(),
});
export type CodingRunnerLlmRequest = z.infer<typeof CodingRunnerLlmRequestSchema>;

export const CodingRunnerLlmResponseSchema = z.strictObject({
  message: z.strictObject({
    role: z.literal('assistant'),
    content: z.string().nullable(),
    tool_calls: z
      .array(
        z.strictObject({
          id: z.string(),
          type: z.literal('function'),
          function: z.strictObject({ name: z.string(), arguments: z.string() }),
        })
      )
      .optional(),
  }),
  usage: z.strictObject({
    inputTokens: z.number().int().nonnegative(),
    outputTokens: z.number().int().nonnegative(),
  }),
});
export type CodingRunnerLlmResponse = z.infer<typeof CodingRunnerLlmResponseSchema>;

export const CodingRunnerTaskResponseSchema = z.strictObject({
  spec: CodingRunnerTaskSchema,
  status: z.enum(CODING_TASK_STATUSES),
  decision: z.enum(['approve', 'reject']).nullable(),
});
export type CodingRunnerTaskResponse = z.infer<typeof CodingRunnerTaskResponseSchema>;

export const CODING_FAILURE_CODES = [
  'plan_rejected',
  'push_rejected',
  'budget_exhausted',
  'runner_timeout',
  'runner_failed',
  'checks_failed',
  'repo_unavailable',
] as const;
export type CodingFailureCode = (typeof CODING_FAILURE_CODES)[number];
