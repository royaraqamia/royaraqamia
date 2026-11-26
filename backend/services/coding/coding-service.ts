import type { GitHubAppClient } from '@/backend/clients/github-app';
import type { Database } from '@/backend/models/database.types';
import type {
  CodingAdminRepository,
  CodingRepository,
  CodingTaskPatch,
} from '@/backend/repositories/coding/coding-repository';
import { AppError } from '@/backend/shared/errors';
import { logger } from '@/backend/shared/logger';
import { generateOpaqueToken, hashToken } from '@/backend/shared/mcp-token-crypto';
import {
  CODING_PLAN_CAPS,
  type CodingAvailableRepoDto,
  type CodingPlanCaps,
  type CodingRepoInput,
  type CodingRunnerLlmRequest,
  type CodingRunnerLlmResponse,
  type CodingRunnerTask,
  type CodingRunnerTaskResponse,
  type CodingRunnerUpdate,
  type CodingStepDto,
  type CodingTaskDto,
  type CodingTaskListQuery,
  type CodingTaskPage,
  type CodingTaskStatus,
  type CodingWorkspaceDto,
  type CreateCodingTaskInput,
  type DecideCodingStepInput,
} from '@/shared/contracts/coding-agent';

import type { SandboxRunner } from './sandbox-runner';

/**
 * Control plane for the coding agent (ADR-0219).
 *
 * All enforcement lives here: monthly caps, an origin-built callback URL, a
 * task-scoped bearer token whose digest is the only thing persisted, plan-first
 * approvals and per-task token budgets. The runner adapter is a port; the
 * repositories and clients are interfaces the composition root supplies.
 */

type PlanId = keyof typeof CODING_PLAN_CAPS;
type LlmMessage = CodingRunnerLlmRequest['messages'][number];
type LlmTool = NonNullable<CodingRunnerLlmRequest['tools']>[number];
type LlmToolCall = NonNullable<NonNullable<LlmMessage['tool_calls']>[number]>;

export interface CodingLlmResult {
  message: CodingRunnerLlmResponse['message'];
  /** Provider-reported usage when the client exposes it; the service estimates otherwise. */
  usage?: { inputTokens: number; outputTokens: number };
}

/** The model key stays in the wiring; the runner only ever sees this interface. */
export interface CodingLlmClient {
  reply(
    request: { messages: LlmMessage[]; tools?: LlmTool[] },
    signal: AbortSignal
  ): Promise<CodingLlmResult>;
}

export interface CodingServiceDeps {
  repo: CodingRepository;
  admin: CodingAdminRepository;
  /** A service-role-backed member repository, used when there is no user session. */
  runnerRepo?: CodingRepository;
  github: GitHubAppClient;
  runner: SandboxRunner;
  llm: CodingLlmClient;
  origin: string;
  /**
   * Seam for the account's plan. Defaults to free; the composition root can
   * resolve the real plan from the existing usage service (ADR-0219 decision 7).
   */
  planFor?: (userId: string) => Promise<PlanId>;
  /**
   * Maps a repository owner to an installation id. The admin repository's
   * `findInstallation` takes an id, so the composition root supplies this lookup;
   * the row itself is always read through the admin repository afterwards.
   */
  installationIdForRepo?: (userId: string, owner: string) => Promise<number | null>;
  /**
   * Ensures `.github/workflows/noor-coding.yml` exists in a connected repo.
   * Returns the URL of a bootstrap PR when the member must merge it first.
   */
  bootstrapWorkflow?: (input: {
    installationId: number;
    owner: string;
    name: string;
    defaultBranch: string;
  }) => Promise<string | null>;
  now?: () => Date;
}

export interface CodingService {
  listWorkspaces(userId: string): Promise<CodingWorkspaceDto[]>;
  /** Repos the member's GitHub App can reach, for the picker that creates workspaces. */
  listAvailableRepos(userId: string): Promise<CodingAvailableRepoDto[]>;
  addWorkspace(userId: string, input: CodingRepoInput): Promise<CodingWorkspaceDto>;
  removeWorkspace(userId: string, workspaceId: string): Promise<void>;
  createTask(userId: string, input: CreateCodingTaskInput): Promise<CodingTaskDto>;
  getTask(userId: string, taskId: string): Promise<CodingTaskDto>;
  listTasks(userId: string, query: CodingTaskListQuery): Promise<CodingTaskPage>;
  decideStep(
    userId: string,
    taskId: string,
    stepId: string,
    decision: DecideCodingStepInput
  ): Promise<CodingTaskDto>;
  runnerTask(rawToken: string): Promise<CodingRunnerTaskResponse>;
  runnerUpdate(rawToken: string, update: CodingRunnerUpdate): Promise<void>;
  runnerLlm(rawToken: string, request: CodingRunnerLlmRequest): Promise<CodingRunnerLlmResponse>;
  cancelTask(userId: string, taskId: string): Promise<CodingTaskDto>;
}

/** The workspace columns the control plane reads, kept local for readability. */
type WorkspaceRow = Database['public']['Tables']['coding_workspaces']['Row'];
type StepRow = Database['public']['Tables']['coding_steps']['Row'];
type TaskRow = Database['public']['Tables']['coding_tasks']['Row'];

/** A refusal with a code the UI can map without matching Arabic copy. */
export class CodingError extends AppError {
  constructor(code: string, message: string, statusCode = 400) {
    super(message, statusCode, code);
    this.name = 'CodingError';
  }
}

const ACTIVE_STATUSES: readonly CodingTaskStatus[] = [
  'queued',
  'running',
  'awaiting_plan',
  'awaiting_push',
];

function isActive(status: string): status is CodingTaskStatus {
  return (ACTIVE_STATUSES as readonly string[]).includes(status);
}

function isoMonthStart(now: Date): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

/** Conservative token estimate: four ASCII characters per token, rounded up. */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function toWorkspaceDto(
  row: WorkspaceRow,
  bootstrapPrUrl: string | null = null
): CodingWorkspaceDto {
  return {
    id: row.id,
    repoOwner: row.repo_owner,
    repoName: row.repo_name,
    defaultBranch: row.default_branch,
    bootstrapPrUrl,
    createdAt: row.created_at,
  };
}

function toStepDto(row: StepRow): CodingStepDto {
  return {
    id: row.id,
    kind: row.kind as CodingStepDto['kind'],
    status: row.status as CodingStepDto['status'],
    summary: row.summary,
    diff: row.diff,
    createdAt: row.created_at,
  };
}

function toTaskDto(row: TaskRow, steps: StepRow[]): CodingTaskDto {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    title: row.title,
    instruction: row.instruction,
    mode: row.mode as CodingTaskDto['mode'],
    status: row.status as CodingTaskStatus,
    branch: row.branch,
    pullRequestUrl: row.pull_request_url,
    summary: row.summary,
    failureCode: row.failure_code,
    steps: steps.map(toStepDto),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Only an absolute http(s) URL may become the pull-request handoff. */
function httpUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
}

/** The picker's own ceiling: a repo list changes rarely, and a token mint costs a call. */
const REPO_CACHE_TTL_MS = 60_000;

export function createCodingService(deps: CodingServiceDeps): CodingService {
  const repoCache = new Map<string, { at: number; repos: CodingAvailableRepoDto[] }>();
  const runnerRepo = deps.runnerRepo ?? deps.repo;
  const now = deps.now ?? (() => new Date());

  async function capsFor(userId: string): Promise<CodingPlanCaps> {
    let plan: PlanId = 'free';
    if (deps.planFor) {
      try {
        const resolved = await deps.planFor(userId);
        if (resolved === 'free' || resolved === 'pro') plan = resolved;
      } catch {
        // A plan lookup failure must not silently grant the larger allowance.
      }
    }
    return CODING_PLAN_CAPS[plan];
  }

  async function dtoFor(userId: string, row: TaskRow): Promise<CodingTaskDto> {
    return toTaskDto(row, await deps.repo.listSteps(userId, row.id));
  }

  async function requireTaskByToken(rawToken: string): Promise<{ task: TaskRow; hash: string }> {
    const hash = hashToken(rawToken);
    const task = await deps.admin.findTaskByCallbackHash(hash);
    if (!task) throw new CodingError('invalid_token', 'رمز المهمة غير صالح.', 401);
    if (!isActive(task.status)) {
      throw new CodingError('task_not_active', 'انتهت هذه المهمة أو أُلغيت.', 409);
    }
    return { task, hash };
  }

  async function requireTask(userId: string, taskId: string): Promise<TaskRow> {
    const task = await deps.repo.findTask(userId, taskId);
    if (!task) throw new CodingError('task_not_found', 'المهمة غير موجودة.', 404);
    return task;
  }

  function specFor(
    task: TaskRow,
    workspace: WorkspaceRow,
    rawToken: string,
    caps: CodingPlanCaps,
    handoffToken: string
  ): CodingRunnerTask {
    return {
      taskId: task.id,
      repoOwner: workspace.repo_owner,
      repoName: workspace.repo_name,
      baseBranch: task.base_branch,
      branch: task.branch ?? `noor/${task.id.slice(0, 8)}`,
      instruction: task.instruction,
      mode: task.mode as CodingRunnerTask['mode'],
      caps: {
        runnerMinutes: caps.runnerMinutes,
        maxInputTokens: caps.maxInputTokens,
        maxOutputTokens: caps.maxOutputTokens,
      },
      callbackUrl: `${deps.origin}/api/coding/runner`,
      callbackToken: rawToken,
      handoffToken,
      runnerUrl: `${deps.origin}/coding/runner-v1.mjs`,
    };
  }

  return {
    async listWorkspaces(userId) {
      const rows = await deps.repo.listWorkspaces(userId);
      return rows.map((row) => toWorkspaceDto(row));
    },

    async listAvailableRepos(userId) {
      const cached = repoCache.get(userId);
      if (cached && now().getTime() - cached.at < REPO_CACHE_TTL_MS) return cached.repos;

      const installations = await deps.admin.listInstallations(userId);
      const repos = await Promise.all(
        installations.map(async (installation) => {
          const { token } = await deps.github.getInstallationToken(installation.installation_id);
          return deps.github.listRepos({ token, perPage: 100 });
        })
      );
      const seen = new Set<string>();
      const available: CodingAvailableRepoDto[] = repos
        .flat()
        .filter((repo) => {
          const fullName = `${repo.owner}/${repo.name}`.toLowerCase();
          if (seen.has(fullName)) return false;
          seen.add(fullName);
          return true;
        })
        .map((repo) => ({
          owner: repo.owner,
          name: repo.name,
          fullName: `${repo.owner}/${repo.name}`,
          defaultBranch: repo.default_branch || 'main',
        }));
      repoCache.set(userId, { at: now().getTime(), repos: available });
      return available;
    },

    async addWorkspace(userId, input) {
      const installationId = await deps.installationIdForRepo?.(userId, input.owner);
      if (!installationId) {
        throw new CodingError('repo_unavailable', 'لا يوجد تثبيت لهذا المستودع.', 404);
      }
      const installation = await deps.admin.findInstallation(userId, installationId);
      if (!installation) {
        throw new CodingError('repo_unavailable', 'لا يوجد تثبيت لهذا المستودع.', 404);
      }

      const { token } = await deps.github.getInstallationToken(installationId);
      const repos = await deps.github.listRepos({ token });
      const match = repos.find(
        (repo) =>
          repo.owner.toLowerCase() === input.owner.toLowerCase() &&
          repo.name.toLowerCase() === input.name.toLowerCase()
      );
      if (!match) {
        throw new CodingError('repo_unavailable', 'المستودع غير متاح لهذا التثبيت.', 404);
      }

      const defaultBranch = match.default_branch || 'main';
      const bootstrapPrUrl = deps.bootstrapWorkflow
        ? await deps.bootstrapWorkflow({
            installationId,
            owner: input.owner,
            name: input.name,
            defaultBranch,
          })
        : null;
      const workspace = await deps.repo.createWorkspace(userId, {
        installationId,
        repoOwner: input.owner,
        repoName: input.name,
        defaultBranch,
      });
      logger.info('Coding agent: repository added', {
        userId,
        installationId,
        repo: `${input.owner}/${input.name}`,
      });
      return toWorkspaceDto(workspace, bootstrapPrUrl);
    },

    async removeWorkspace(userId, workspaceId) {
      const removed = await deps.repo.deleteWorkspace(userId, workspaceId);
      if (!removed) throw new CodingError('workspace_not_found', 'مساحة العمل غير موجودة.', 404);
    },

    async createTask(userId, input) {
      const caps = await capsFor(userId);
      const used = await deps.repo.countTasksSince(userId, isoMonthStart(now()));
      if (used >= caps.tasksPerMonth) {
        throw new CodingError('usage_limit', 'بلغت الحد الأعلى للمهام لهذا الشهر.', 402);
      }

      const workspace = await deps.repo.findWorkspace(userId, input.workspaceId);
      if (!workspace) {
        throw new CodingError('workspace_not_found', 'مساحة العمل غير موجودة.', 404);
      }

      const rawToken = generateOpaqueToken();
      const created = await deps.repo.createTask(userId, {
        workspaceId: workspace.id,
        title: input.title,
        instruction: input.instruction,
        mode: input.mode,
        baseBranch: input.baseBranch,
        runnerMinutes: caps.runnerMinutes,
        callbackTokenHash: hashToken(rawToken),
      });
      const branch = `noor/${created.id.slice(0, 8)}`;
      await deps.repo.updateTask(userId, created.id, { branch });
      const row: TaskRow = { ...created, branch };

      try {
        const installation = await deps.admin.findInstallation(userId, workspace.installation_id);
        if (!installation) {
          throw new CodingError('repo_unavailable', 'لا يوجد تثبيت لهذا المستودع.', 404);
        }
        // Installation tokens expire in about an hour; the one saved at connect
        // time is only a bootstrap credential. Mint a fresh one for this task.
        const { token } = await deps.github.getInstallationToken(installation.installation_id);
        const spec = specFor(row, workspace, rawToken, caps, token);
        await deps.runner.start(spec, { installationToken: token });
      } catch (error) {
        await deps.repo.updateTask(userId, row.id, {
          status: 'failed',
          failure_code: 'runner_failed',
          summary: error instanceof Error ? error.message.slice(0, 200) : 'runner_failed',
        });
        if (error instanceof CodingError) throw error;
        throw new CodingError('runner_failed', 'تعذّر بدء التنفيذ.', 502);
      }

      logger.info('Coding agent: task started', {
        userId,
        taskId: created.id,
        mode: input.mode,
        workspaceId: workspace.id,
      });
      return dtoFor(userId, row);
    },

    async getTask(userId, taskId) {
      return dtoFor(userId, await requireTask(userId, taskId));
    },

    async listTasks(userId, query) {
      const [before, beforeId] = query.cursor ? query.cursor.split('|') : [];
      if (query.cursor && (!before || !beforeId)) {
        throw new CodingError('invalid_cursor', 'المؤشر غير صالح.', 400);
      }
      const rows = await deps.repo.listTasks(userId, {
        limit: query.limit,
        before: before ?? null,
        beforeId: beforeId ?? null,
      });
      const page = rows.slice(0, query.limit);
      const tasks = await Promise.all(page.map((row) => dtoFor(userId, row)));
      const last = rows[query.limit - 1];
      return {
        tasks,
        nextCursor: rows.length > query.limit && last ? `${last.created_at}|${last.id}` : null,
      };
    },

    async decideStep(userId, taskId, stepId, decision) {
      const task = await requireTask(userId, taskId);
      if (task.status !== 'awaiting_plan' && task.status !== 'awaiting_push') {
        throw new CodingError('task_not_awaiting', 'المهمة لا تنتظر قراراً.', 409);
      }
      const step = await deps.repo.findProposedStep(userId, taskId);
      if (!step || step.id !== stepId) {
        throw new CodingError('step_not_found', 'الخطوة المقترحة غير موجودة.', 404);
      }

      const approved = decision.decision === 'approve';
      // The runner reads decisions through the service-role repository, so the
      // decision is written there too: both sides then see the same row.
      await deps.admin.setStepDecision(userId, stepId, approved ? 'applied' : 'rejected');
      const patch: CodingTaskPatch = approved
        ? { status: 'running', failure_code: null }
        : {
            status: 'failed',
            failure_code: step.kind === 'plan' ? 'plan_rejected' : 'push_rejected',
          };
      await deps.repo.updateTask(userId, taskId, patch);
      return dtoFor(userId, { ...task, ...patch });
    },

    async runnerTask(rawToken) {
      const { task } = await requireTaskByToken(rawToken);
      const workspace = await runnerRepo.findWorkspace(task.user_id, task.workspace_id);
      if (!workspace) throw new CodingError('repo_unavailable', 'مساحة العمل غير موجودة.', 404);

      const steps = await runnerRepo.listSteps(task.user_id, task.id);
      const decided = [...steps]
        .reverse()
        .find((step) => step.status === 'applied' || step.status === 'rejected');
      const caps = await capsFor(task.user_id);
      const { token } = await deps.github.getInstallationToken(workspace.installation_id);
      return {
        spec: specFor(task, workspace, rawToken, caps, token),
        status: task.status as CodingTaskStatus,
        decision: decided ? (decided.status === 'applied' ? 'approve' : 'reject') : null,
      };
    },

    async runnerUpdate(rawToken, update) {
      const { task, hash } = await requireTaskByToken(rawToken);
      const caps = await capsFor(task.user_id);
      const inputTokens = task.input_tokens + (update.inputTokens ?? 0);
      const outputTokens = task.output_tokens + (update.outputTokens ?? 0);
      if (inputTokens > caps.maxInputTokens || outputTokens > caps.maxOutputTokens) {
        await deps.admin.updateTaskByCallbackHash(hash, {
          status: 'failed',
          failure_code: 'budget_exhausted',
        });
        throw new CodingError('budget_exhausted', 'انتهت ميزانية الرمز لهذه المهمة.', 402);
      }

      // A gate request is stored as a proposal so `decideStep` can find the
      // exact step the member is approving, not just any earlier one.
      const gateRequested =
        (update.kind === 'plan' || update.kind === 'push') && update.status === 'running';
      await deps.admin.insertStepForRunner(task.user_id, {
        taskId: task.id,
        kind: update.kind,
        status: gateRequested ? 'proposed' : update.status,
        summary: update.summary,
        diff: update.diff,
        failureCode: update.failureCode,
        inputTokens: update.inputTokens ?? 0,
        outputTokens: update.outputTokens ?? 0,
      });

      const patch: CodingTaskPatch = { input_tokens: inputTokens, output_tokens: outputTokens };
      if (update.failureCode) {
        patch.status = 'failed';
        patch.failure_code = update.failureCode;
      } else if (update.kind === 'plan' && update.status === 'running') {
        patch.status = 'awaiting_plan';
      } else if (update.kind === 'push' && update.status === 'running') {
        patch.status = 'awaiting_push';
      } else if (update.kind === 'pull_request') {
        patch.status = 'completed';
        const url = httpUrl(update.diff);
        if (url) patch.pull_request_url = url;
      }
      await deps.admin.updateTaskByCallbackHash(hash, patch);
    },

    async runnerLlm(rawToken, request) {
      const { task, hash } = await requireTaskByToken(rawToken);
      const caps = await capsFor(task.user_id);
      const requestTokens =
        estimateTokens(JSON.stringify(request.messages)) +
        estimateTokens(JSON.stringify(request.tools ?? []));

      if (
        task.input_tokens + requestTokens > caps.maxInputTokens ||
        task.output_tokens >= caps.maxOutputTokens
      ) {
        await deps.admin.updateTaskByCallbackHash(hash, {
          status: 'failed',
          failure_code: 'budget_exhausted',
        });
        throw new CodingError('budget_exhausted', 'انتهت ميزانية الرمز لهذه المهمة.', 402);
      }

      const result = await deps.llm.reply(
        { messages: request.messages, tools: request.tools },
        AbortSignal.timeout(60_000)
      );
      const usage = result.usage ?? {
        inputTokens: requestTokens,
        outputTokens: estimateTokens(
          JSON.stringify({
            content: result.message.content,
            tool_calls: result.message.tool_calls ?? [],
          })
        ),
      };
      const inputTokens = task.input_tokens + usage.inputTokens;
      const outputTokens = task.output_tokens + usage.outputTokens;
      if (inputTokens > caps.maxInputTokens || outputTokens > caps.maxOutputTokens) {
        await deps.admin.updateTaskByCallbackHash(hash, {
          status: 'failed',
          failure_code: 'budget_exhausted',
          input_tokens: inputTokens,
          output_tokens: outputTokens,
        });
        throw new CodingError('budget_exhausted', 'انتهت ميزانية الرمز لهذه المهمة.', 402);
      }

      await deps.admin.updateTaskByCallbackHash(hash, {
        input_tokens: inputTokens,
        output_tokens: outputTokens,
      });
      return { message: result.message, usage };
    },

    async cancelTask(userId, taskId) {
      const task = await requireTask(userId, taskId);
      const patch: CodingTaskPatch = { status: 'cancelled', failure_code: null };
      await deps.repo.updateTask(userId, taskId, patch);
      return dtoFor(userId, { ...task, ...patch });
    },
  };
}

export type { LlmMessage, LlmTool, LlmToolCall };
