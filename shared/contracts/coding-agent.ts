/**
 * Wire shapes for the coding-agent capability (ADR-0219, ADR-0223).
 *
 * The chat service is the control plane; an isolated runner executes code. Both
 * sides decode the same schemas so the runner cannot invent a step, a status or
 * a spending limit. The runner speaks to the control plane over HTTPS with a
 * short-lived, task-scoped token — never with a member credential.
 */

import { z } from 'zod';

/**
 * Where the work happens. `github` is one repository, `local` is a folder on
 * the member's own device (ADR-0222), and `group` is an explicit set of
 * repositories that share one installation (ADR-0223). A group is a workspace
 * kind, not an execution kind: its task still runs in the Actions plane.
 */
export const CODING_WORKSPACE_KINDS = ['github', 'local', 'group'] as const;
export type CodingWorkspaceKind = (typeof CODING_WORKSPACE_KINDS)[number];

/** How a task executes. A group runs on GitHub; only its repo set differs. */
export const CODING_EXECUTION_KINDS = ['github', 'local'] as const;
export type CodingExecutionKind = (typeof CODING_EXECUTION_KINDS)[number];

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
  'review',
  'reviewer',
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

/** Per-repository state inside a task. One row per repository in the set. */
export const CODING_REPO_STATUSES = ['queued', 'running', 'completed', 'failed'] as const;
export type CodingRepoStatus = (typeof CODING_REPO_STATUSES)[number];

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

/**
 * A group is a named set of repositories. All of them must resolve to one
 * installation, so the task holds one short-lived token for the whole set
 * (ADR-0223).
 */
export const CreateCodingGroupSchema = z.strictObject({
  kind: z.literal('group'),
  name: z.string().trim().min(1).max(80),
  repos: z.array(CodingRepoInputSchema).min(2).max(8),
});
export type CreateCodingGroupInput = z.infer<typeof CreateCodingGroupSchema>;

/** The single-repository body stays as it was; the group body is the new arm. */
export const CreateCodingWorkspaceSchema = z.union([
  CodingRepoInputSchema,
  CreateCodingGroupSchema,
]);
export type CreateCodingWorkspaceInput = z.infer<typeof CreateCodingWorkspaceSchema>;

export const CreateCodingTaskSchema = z.strictObject({
  workspaceId: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
  instruction: z.string().trim().min(1).max(20_000),
  mode: z.enum(CODING_TASK_MODES),
  baseBranch: z.string().trim().min(1).max(200).default('main'),
  /**
   * A group task may narrow its workspace's set. Omitted means every repository
   * in the workspace. Ids are workspace-repo rows, not repository names, so a
   * rename on GitHub cannot silently change what a task touches.
   */
  repoIds: z.array(z.string().uuid()).min(1).max(8).optional(),
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

/** One repository inside a group workspace. */
export const CodingWorkspaceRepoDtoSchema = z.strictObject({
  id: z.string().uuid(),
  owner: z.string(),
  name: z.string(),
  fullName: z.string(),
  defaultBranch: z.string(),
});
export type CodingWorkspaceRepoDto = z.infer<typeof CodingWorkspaceRepoDtoSchema>;

export const CodingWorkspaceDtoSchema = z.strictObject({
  id: z.string().uuid(),
  kind: z.enum(CODING_WORKSPACE_KINDS),
  /** Null for a local folder, which has no repository on the server side. */
  repoOwner: z.string().nullable(),
  repoName: z.string().nullable(),
  /** Null for a local folder: the companion, not the server, knows its branch. */
  defaultBranch: z.string().nullable(),
  /** The device a local workspace belongs to; null for every other kind. */
  deviceLabel: z.string().nullable(),
  /** The member's name for a group workspace; null for every other kind. */
  name: z.string().nullable(),
  /** A group's repository set; empty for a single repository or a local folder. */
  repos: z.array(CodingWorkspaceRepoDtoSchema),
  /** One-time PRs that install the workflow file, one per repository. */
  bootstrapPrUrls: z.array(z.string()),
  createdAt: z.string(),
});
export type CodingWorkspaceDto = z.infer<typeof CodingWorkspaceDtoSchema>;

/**
 * A pairing code is shown once when the member creates it; only its digest is
 * stored, and it expires in ten minutes. The companion trades it for one
 * long-lived, revocable grant token that never leaves the device.
 */
export const CreateCodingLocalPairSchema = z.strictObject({
  deviceLabel: z.string().trim().min(1).max(80),
});
export type CreateCodingLocalPairInput = z.infer<typeof CreateCodingLocalPairSchema>;

export const CodingLocalPairDtoSchema = z.strictObject({
  code: z.string().min(4).max(32),
  deviceLabel: z.string(),
  expiresAt: z.string(),
});
export type CodingLocalPairDto = z.infer<typeof CodingLocalPairDtoSchema>;

/** The companion sends no path: only the folder's basename stays on the device. */
export const ClaimCodingLocalPairSchema = z.strictObject({
  code: z.string().trim().min(4).max(32),
  deviceLabel: z.string().trim().min(1).max(80).optional(),
});
export type ClaimCodingLocalPairInput = z.infer<typeof ClaimCodingLocalPairSchema>;

export const CodingLocalGrantDtoSchema = z.strictObject({
  id: z.string().uuid(),
  deviceLabel: z.string(),
  workspaceId: z.string().uuid().nullable(),
  createdAt: z.string(),
  lastSeenAt: z.string().nullable(),
  revokedAt: z.string().nullable(),
});
export type CodingLocalGrantDto = z.infer<typeof CodingLocalGrantDtoSchema>;

/** What the companion keeps in its own config file, never on the server. */
export const CodingLocalClaimResponseSchema = z.strictObject({
  token: z.string().min(20),
  grant: CodingLocalGrantDtoSchema,
  apiUrl: z.string().url(),
  runnerUrl: z.string().url(),
});
export type CodingLocalClaimResponse = z.infer<typeof CodingLocalClaimResponseSchema>;

/** A repository the member's GitHub App installation can reach, not yet a workspace. */
export const CodingAvailableRepoDtoSchema = z.strictObject({
  owner: z.string(),
  name: z.string(),
  fullName: z.string(),
  defaultBranch: z.string(),
});
export type CodingAvailableRepoDto = z.infer<typeof CodingAvailableRepoDtoSchema>;

/** A task's per-repository branch and pull request (ADR-0223). */
export const CodingTaskRepoDtoSchema = z.strictObject({
  id: z.string().uuid(),
  owner: z.string(),
  name: z.string(),
  fullName: z.string(),
  baseBranch: z.string(),
  branch: z.string().nullable(),
  pullRequestUrl: z.string().nullable(),
  status: z.enum(CODING_REPO_STATUSES),
  failureCode: z.string().nullable(),
});
export type CodingTaskRepoDto = z.infer<typeof CodingTaskRepoDtoSchema>;

export const CodingStepDtoSchema = z.strictObject({
  id: z.string().uuid(),
  kind: z.enum(CODING_STEP_KINDS),
  status: z.enum(CODING_STEP_STATUSES),
  summary: z.string(),
  diff: z.string().nullable(),
  /** `owner/name` for a multi-repository step; null for the task as a whole. */
  repo: z.string().nullable(),
  /** The model that produced this step, when a model did. */
  model: z.string().nullable(),
  latencyMs: z.number().int().nonnegative().nullable(),
  /** Provider list-price estimate in USD; token counts are the measured value. */
  costUsd: z.number().nonnegative().nullable(),
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
  /** The first repository's branch, kept for a single-repository task. */
  branch: z.string().nullable(),
  pullRequestUrl: z.string().nullable(),
  /** One row per repository; a single repository has exactly one. */
  repos: z.array(CodingTaskRepoDtoSchema),
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

/** One checkout inside the runner's workspace, one branch per repository. */
export const CodingRunnerRepoSchema = z.strictObject({
  owner: z.string(),
  name: z.string(),
  fullName: z.string(),
  baseBranch: z.string(),
  branch: z.string(),
  /** Directory under the runner's workspace root. */
  dir: z.string(),
});
export type CodingRunnerRepo = z.infer<typeof CodingRunnerRepoSchema>;

/** What the runner needs to start. No member credential crosses this boundary. */
export const CodingRunnerTaskSchema = z
  .strictObject({
    taskId: z.string().uuid(),
    title: z.string().max(200),
    /**
     * `github` pushes a branch; `local` leaves the diff in the member's folder.
     * A group workspace runs as `github`
     */
    kind: z.enum(CODING_EXECUTION_KINDS),
    repoOwner: z.string().nullable(),
    repoName: z.string().nullable(),
    baseBranch: z.string().nullable(),
    branch: z.string().nullable(),
    /** The explicit repository set. Empty only for a local folder task. */
    repos: z.array(CodingRunnerRepoSchema).max(8),
    instruction: z.string(),
    mode: z.enum(CODING_TASK_MODES),
    caps: z.strictObject({
      runnerMinutes: z.number().int().positive(),
      maxInputTokens: z.number().int().positive(),
      maxOutputTokens: z.number().int().positive(),
    }),
    /**
     * Present only when the committed eval evidence has switched the reviewer on
     * (ADR-0223). A null value means the runner must not ask for a review.
     */
    reviewer: z
      .strictObject({
        model: z.string().min(1).max(100),
        minFiles: z.number().int().nonnegative(),
        minChangedLines: z.number().int().nonnegative(),
      })
      .nullable(),
    callbackUrl: z.string().url(),
    /** Raw short-lived bearer token. The control plane stores only its hash. */
    callbackToken: z.string().min(20),
    /** Short-lived installation token used only for clone, push and PR handoff. */
    handoffToken: z.string().min(20).nullable(),
    runnerUrl: z.string().url(),
  })
  .superRefine((value, ctx) => {
    // A local folder has no checkout; every GitHub task has at least one.
    if (value.kind === 'github' && value.repos.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['repos'],
        message: 'a GitHub task needs at least one repository',
      });
    }
  });
export type CodingRunnerTask = z.infer<typeof CodingRunnerTaskSchema>;

/** Progress frames the runner posts to the control plane. */
export const CodingRunnerUpdateSchema = z.strictObject({
  kind: z.enum(CODING_STEP_KINDS),
  status: z.enum(['running', 'applied', 'failed']),
  summary: z.string().max(20_000),
  diff: z.string().max(200_000).nullable(),
  /** `owner/name` when the frame belongs to one repository. */
  repo: z.string().max(200).nullable().optional(),
  failureCode: z.string().max(80).nullable(),
  /** The runner's cumulative spend for the task, not a delta for this frame. */
  inputTokens: z.number().int().nonnegative().nullable(),
  outputTokens: z.number().int().nonnegative().nullable(),
  /** Model and latency are recorded for every model-produced step. */
  model: z.string().max(100).nullable().optional(),
  latencyMs: z.number().int().nonnegative().nullable().optional(),
});
export type CodingRunnerUpdate = z.infer<typeof CodingRunnerUpdateSchema>;

/** The runner keeps the conversation; the control plane owns the model key. */
export const CodingRunnerLlmRequestSchema = z.strictObject({
  /** `reviewer` is a second model and is refused unless its gate is on. */
  purpose: z.enum(['writer', 'reviewer']).optional(),
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
  /** The model that answered, so the runner can record it on the step. */
  model: z.string().min(1).max(100),
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
  'repo_set_invalid',
] as const;
export type CodingFailureCode = (typeof CODING_FAILURE_CODES)[number];
