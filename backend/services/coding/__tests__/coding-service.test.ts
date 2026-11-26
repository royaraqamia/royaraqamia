import { beforeAll, describe, expect, it, vi } from 'vitest';

import type { GitHubAppClient } from '@/backend/clients/github-app';
import type {
  CodingAdminRepository,
  CodingRepository,
  CodingStepRow,
  CodingTaskRepoRow,
  CodingTaskRow,
  CodingWorkspaceRepoRow,
  CodingWorkspaceRow,
} from '@/backend/repositories/coding/coding-repository';
import {
  createCodingService,
  type CodingLlmClient,
  type CodingServiceDeps,
} from '@/backend/services/coding/coding-service';
import type { SandboxRunner } from '@/backend/services/coding/sandbox-runner';
import { encryptSecret, hashToken } from '@/backend/shared/mcp-token-crypto';
import type { CodingRunnerTask } from '@/shared/contracts/coding-agent';

/** The real crypto helper needs a real key; the installation token never leaves plaintext here. */
beforeAll(() => {
  process.env.MCP_TOKEN_ENCRYPTION_KEY = '1'.repeat(64);
});

const USER = '00000000-0000-4000-8000-000000000001';
const WORKSPACE = '00000000-0000-4000-8000-000000000002';
const TASK = '00000000-0000-4000-8000-000000000003';
const STEP = '00000000-0000-4000-8000-000000000004';
const WORKSPACE_REPO = '00000000-0000-4000-8000-000000000005';
const TASK_REPO = '00000000-0000-4000-8000-000000000006';
const CREATED_AT = '2026-11-05T10:00:00.000Z';
const RAW_TOKEN = 'runner-token-abcdefghijklmnopqrstuvwxyz';

const workspace: CodingWorkspaceRow = {
  id: WORKSPACE,
  user_id: USER,
  kind: 'github',
  installation_id: 42,
  repo_owner: 'member',
  repo_name: 'repo',
  default_branch: 'main',
  device_label: null,
  group_name: null,
  created_at: CREATED_AT,
};

const workspaceRepo: CodingWorkspaceRepoRow = {
  id: WORKSPACE_REPO,
  user_id: USER,
  workspace_id: WORKSPACE,
  installation_id: 42,
  repo_owner: 'member',
  repo_name: 'repo',
  default_branch: 'main',
  created_at: CREATED_AT,
};

function makeTaskRepo(overrides: Partial<CodingTaskRepoRow> = {}): CodingTaskRepoRow {
  return {
    id: TASK_REPO,
    user_id: USER,
    task_id: TASK,
    workspace_repo_id: null,
    repo_owner: 'member',
    repo_name: 'repo',
    base_branch: 'main',
    branch: `noor/${TASK.slice(0, 8)}`,
    pull_request_url: null,
    status: 'running',
    failure_code: null,
    created_at: CREATED_AT,
    updated_at: CREATED_AT,
    ...overrides,
  };
}

function makeTask(overrides: Partial<CodingTaskRow> = {}): CodingTaskRow {
  return {
    id: TASK,
    user_id: USER,
    workspace_id: WORKSPACE,
    title: 'Fix the thing',
    instruction: 'Fix the failing test',
    mode: 'plan',
    status: 'queued',
    base_branch: 'main',
    branch: null,
    pull_request_url: null,
    summary: '',
    failure_code: null,
    runner_minutes: 15,
    input_tokens: 0,
    output_tokens: 0,
    callback_token_hash: hashToken(RAW_TOKEN),
    created_at: CREATED_AT,
    updated_at: CREATED_AT,
    server_updated_at: CREATED_AT,
    ...overrides,
  };
}

function makeStep(overrides: Partial<CodingStepRow> = {}): CodingStepRow {
  return {
    id: STEP,
    user_id: USER,
    task_id: TASK,
    kind: 'plan',
    status: 'proposed',
    summary: 'Proposed plan',
    diff: 'diff --git a/a b/a',
    failure_code: null,
    input_tokens: 0,
    output_tokens: 0,
    task_repo_id: null,
    model: null,
    latency_ms: null,
    cost_usd: null,
    created_at: CREATED_AT,
    ...overrides,
  };
}

interface Harness {
  deps: CodingServiceDeps;
  repo: Record<string, ReturnType<typeof vi.fn>>;
  admin: Record<string, ReturnType<typeof vi.fn>>;
  runner: { start: ReturnType<typeof vi.fn> };
  llm: { reply: ReturnType<typeof vi.fn> };
  github: { getInstallationToken: ReturnType<typeof vi.fn>; listRepos: ReturnType<typeof vi.fn> };
}

function harness(overrides: Partial<CodingServiceDeps> = {}, task = makeTask()): Harness {
  const repo = {
    listWorkspaces: vi.fn().mockResolvedValue([workspace]),
    findWorkspace: vi.fn().mockResolvedValue(workspace),
    createWorkspace: vi.fn().mockResolvedValue(workspace),
    deleteWorkspace: vi.fn().mockResolvedValue(true),
    countTasksSince: vi.fn().mockResolvedValue(0),
    createTask: vi.fn().mockImplementation(async (_userId: string, values: object) => ({
      ...task,
      ...values,
      callback_token_hash:
        'callbackTokenHash' in values
          ? String((values as { callbackTokenHash?: string }).callbackTokenHash ?? '')
          : null,
    })),
    findTask: vi.fn().mockResolvedValue(task),
    listTasks: vi.fn().mockResolvedValue([]),
    listWorkspaceRepos: vi.fn().mockResolvedValue([workspaceRepo]),
    findWorkspaceRepo: vi.fn().mockResolvedValue(workspaceRepo),
    createWorkspaceGroup: vi.fn().mockResolvedValue(workspace),
    listTaskRepos: vi.fn().mockResolvedValue([]),
    createTaskRepo: vi.fn().mockImplementation(
      async (
        _userId: string,
        values: {
          workspaceRepoId: string | null;
          repoOwner: string;
          repoName: string;
          baseBranch: string;
          branch: string;
        }
      ) =>
        makeTaskRepo({
          id: values.workspaceRepoId ?? TASK_REPO,
          repo_owner: values.repoOwner,
          repo_name: values.repoName,
          base_branch: values.baseBranch,
          branch: values.branch,
        })
    ),
    updateTaskRepo: vi.fn().mockResolvedValue(undefined),
    listSteps: vi.fn().mockResolvedValue([]),
    updateTask: vi.fn().mockResolvedValue(undefined),
    insertStep: vi.fn().mockResolvedValue(undefined),
    updateStep: vi.fn().mockResolvedValue(undefined),
    findProposedStep: vi.fn().mockResolvedValue(null),
  };
  const admin = {
    findInstallation: vi.fn().mockResolvedValue({
      user_id: USER,
      installation_id: 42,
      token_enc: encryptSecret('ghs_installation_token'),
      token_expires_at: '2026-11-05T11:00:00.000Z',
    }),
    listInstallations: vi.fn().mockResolvedValue([
      {
        user_id: USER,
        installation_id: 42,
        token_enc: encryptSecret('ghs_installation_token'),
        token_expires_at: '2026-11-05T11:00:00.000Z',
      },
    ]),
    findTaskByCallbackHash: vi.fn().mockResolvedValue(task),
    updateTaskByCallbackHash: vi.fn().mockImplementation(async (_hash: string, patch: object) => {
      Object.assign(task, patch);
    }),
    listWorkspaceRepos: vi.fn().mockResolvedValue([workspaceRepo]),
    listTaskRepos: vi.fn().mockResolvedValue([]),
    findTaskRepoByFullName: vi.fn().mockResolvedValue(null),
    updateTaskRepo: vi.fn().mockResolvedValue(undefined),
    insertStepForRunner: vi.fn().mockResolvedValue(undefined),
    setStepDecision: vi.fn().mockResolvedValue(undefined),
    findActiveGrantForWorkspace: vi.fn().mockResolvedValue(null),
    createLocalWorkspace: vi.fn().mockResolvedValue(workspace),
    deleteWorkspace: vi.fn().mockResolvedValue(true),
    createLocalPair: vi.fn().mockResolvedValue(null),
    findLocalPair: vi.fn().mockResolvedValue(null),
    claimLocalPair: vi.fn().mockResolvedValue(null),
    findLocalGrantByTokenHash: vi.fn().mockResolvedValue(null),
    listLocalGrants: vi.fn().mockResolvedValue([]),
    touchLocalGrant: vi.fn().mockResolvedValue(undefined),
    revokeLocalGrant: vi.fn().mockResolvedValue(true),
    claimNextLocalTask: vi.fn().mockResolvedValue(null),
    failActiveTasksForWorkspace: vi.fn().mockResolvedValue(undefined),
  };
  const runner = { start: vi.fn().mockResolvedValue({ runId: TASK }) };
  const llm = {
    model: 'deepseek-v4.1-flash',
    reply: vi.fn().mockResolvedValue({
      message: { role: 'assistant', content: 'done' },
      usage: { inputTokens: 10, outputTokens: 5 },
    }),
  };
  const github = {
    getInstallationToken: vi.fn().mockResolvedValue({
      token: 'ghs_installation_token',
      expiresAt: '2026-11-05T11:00:00.000Z',
    }),
    listRepos: vi
      .fn()
      .mockResolvedValue([{ owner: 'member', name: 'repo', default_branch: 'main' }]),
  };

  const deps: CodingServiceDeps = {
    repo: repo as unknown as CodingRepository,
    admin: admin as unknown as CodingAdminRepository,
    runnerRepo: repo as unknown as CodingRepository,
    github: github as unknown as GitHubAppClient,
    runner: runner as unknown as SandboxRunner,
    llm: llm as unknown as CodingLlmClient,
    origin: 'https://noor.test',
    planFor: async () => 'free',
    installationIdForRepo: async () => 42,
    now: () => new Date('2026-11-15T12:00:00.000Z'),
    ...overrides,
  };
  return { deps, repo, admin, runner, llm, github };
}

const createInput = {
  workspaceId: WORKSPACE,
  title: 'Fix the thing',
  instruction: 'Fix the failing test',
  mode: 'plan' as const,
  baseBranch: 'main',
};

describe('CodingService repo picker', () => {
  it('lists the repositories behind the member installations once each', async () => {
    const { deps, admin, github } = harness();
    const service = createCodingService(deps);

    await expect(service.listAvailableRepos(USER)).resolves.toEqual([
      {
        owner: 'member',
        name: 'repo',
        fullName: 'member/repo',
        defaultBranch: 'main',
      },
    ]);
    expect(admin.listInstallations).toHaveBeenCalledWith(USER);
    expect(github.getInstallationToken).toHaveBeenCalledWith(42);
    expect(github.listRepos).toHaveBeenCalledWith({
      token: 'ghs_installation_token',
      perPage: 100,
    });
  });
});

describe('CodingService monthly caps and dispatch', () => {
  it('refuses a fourth free task before dispatching anything', async () => {
    const { deps, repo, runner } = harness();
    (repo.countTasksSince as ReturnType<typeof vi.fn>).mockResolvedValue(3);
    const service = createCodingService(deps);

    await expect(service.createTask(USER, createInput)).rejects.toMatchObject({
      code: 'usage_limit',
      statusCode: 402,
    });
    expect(runner.start).not.toHaveBeenCalled();
  });

  it('dispatches with hashed callback, decrypted credential and plan caps', async () => {
    const { deps, repo, runner } = harness();
    const service = createCodingService(deps);

    const task = await service.createTask(USER, createInput);

    const createMock = repo.createTask!;
    const row = (await createMock.mock.results[0]!.value) as { callback_token_hash: string };
    expect(task.branch).toBe(`noor/${TASK.slice(0, 8)}`);

    const [spec, credential] = runner.start.mock.calls[0] as [
      CodingRunnerTask & { callbackToken: string },
      { installationToken: string },
    ];
    expect(row.callback_token_hash).toBe(hashToken(spec.callbackToken));
    expect(spec.callbackToken.length).toBeGreaterThanOrEqual(20);
    expect(credential.installationToken).toBe('ghs_installation_token');
    expect(spec.callbackUrl).toBe('https://noor.test/api/coding/runner');
    expect(spec.runnerUrl).toBe('https://noor.test/coding/runner-v1.mjs');
    expect(spec.caps).toEqual({
      runnerMinutes: 15,
      maxInputTokens: 200_000,
      maxOutputTokens: 30_000,
    });
  });

  it('uses Pro caps when the plan seam reports pro', async () => {
    const { deps, runner } = harness({ planFor: async () => 'pro' });
    const service = createCodingService(deps);

    await service.createTask(USER, createInput);

    const [spec] = runner.start.mock.calls[0] as [CodingRunnerTask];
    expect(spec.caps).toEqual({
      runnerMinutes: 30,
      maxInputTokens: 500_000,
      maxOutputTokens: 50_000,
    });
  });

  it('marks a failed dispatch and rethrows a typed error', async () => {
    const { deps, repo, runner } = harness();
    runner.start.mockRejectedValue(new Error('workflow down'));
    const service = createCodingService(deps);

    await expect(service.createTask(USER, createInput)).rejects.toMatchObject({
      code: 'runner_failed',
    });
    expect(repo.updateTask).toHaveBeenCalledWith(USER, TASK, {
      status: 'failed',
      failure_code: 'runner_failed',
      summary: 'workflow down',
    });
  });
});

describe('CodingService approvals', () => {
  it('approves a proposed plan and resumes the task', async () => {
    const { deps, repo, admin } = harness({}, makeTask({ status: 'awaiting_plan' }));
    (repo.findProposedStep as ReturnType<typeof vi.fn>).mockResolvedValue(makeStep());
    const service = createCodingService(deps);

    const result = await service.decideStep(USER, TASK, STEP, { decision: 'approve' });

    expect(admin.setStepDecision).toHaveBeenCalledWith(USER, STEP, 'applied');
    expect(repo.updateTask).toHaveBeenCalledWith(USER, TASK, {
      status: 'running',
      failure_code: null,
    });
    expect(result.status).toBe('running');
  });

  it('rejects a proposed plan with plan_rejected', async () => {
    const { deps, repo, admin } = harness({}, makeTask({ status: 'awaiting_plan' }));
    (repo.findProposedStep as ReturnType<typeof vi.fn>).mockResolvedValue(makeStep());
    const service = createCodingService(deps);

    const result = await service.decideStep(USER, TASK, STEP, { decision: 'reject' });

    expect(admin.setStepDecision).toHaveBeenCalledWith(USER, STEP, 'rejected');
    expect(result.status).toBe('failed');
    expect(result.failureCode).toBe('plan_rejected');
  });

  it('rejects a push with push_rejected', async () => {
    const { deps, repo } = harness({}, makeTask({ status: 'awaiting_push' }));
    (repo.findProposedStep as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeStep({ kind: 'push' })
    );
    const service = createCodingService(deps);

    const result = await service.decideStep(USER, TASK, STEP, { decision: 'reject' });

    expect(result.failureCode).toBe('push_rejected');
  });

  it('refuses a decision outside an awaiting state', async () => {
    const { deps, repo } = harness({}, makeTask({ status: 'running' }));
    const service = createCodingService(deps);

    await expect(
      service.decideStep(USER, TASK, STEP, { decision: 'approve' })
    ).rejects.toMatchObject({ code: 'task_not_awaiting', statusCode: 409 });
    expect(repo.updateStep).not.toHaveBeenCalled();
  });

  it('reports the last decision to the polling runner', async () => {
    const { deps, repo } = harness({}, makeTask({ status: 'running', branch: 'noor/00000000' }));
    (repo.listSteps as ReturnType<typeof vi.fn>).mockResolvedValue([
      makeStep({ id: 'a', status: 'applied' }),
      makeStep({ id: 'b', status: 'rejected', kind: 'push' }),
    ]);
    const service = createCodingService(deps);

    const result = await service.runnerTask(RAW_TOKEN);

    expect(result.decision).toBe('reject');
    expect(result.spec.branch).toBe('noor/00000000');
  });
});

describe('CodingService runner updates and budgets', () => {
  const update = (overrides: object = {}) => ({
    kind: 'edit' as const,
    status: 'applied' as const,
    summary: 'Edited a file',
    diff: null,
    failureCode: null,
    inputTokens: 100,
    outputTokens: 20,
    ...overrides,
  });

  it('checkpoints a step and accumulates token usage', async () => {
    const { deps, admin } = harness();
    const service = createCodingService(deps);

    await service.runnerUpdate(RAW_TOKEN, update());

    expect(admin.insertStepForRunner).toHaveBeenCalledWith(USER, {
      taskId: TASK,
      kind: 'edit',
      status: 'applied',
      summary: 'Edited a file',
      diff: null,
      failureCode: null,
      inputTokens: 100,
      outputTokens: 20,
      taskRepoId: null,
      model: null,
      latencyMs: null,
      costUsd: null,
    });
    expect(admin.updateTaskByCallbackHash).toHaveBeenCalledWith(hashToken(RAW_TOKEN), {
      input_tokens: 100,
      output_tokens: 20,
    });
  });

  it('waits for approval on a running plan and completes on a pull request', async () => {
    const { deps, admin } = harness();
    const service = createCodingService(deps);

    await service.runnerUpdate(
      RAW_TOKEN,
      update({ kind: 'plan', status: 'running', inputTokens: 1, outputTokens: 1 })
    );
    expect(admin.updateTaskByCallbackHash).toHaveBeenLastCalledWith(hashToken(RAW_TOKEN), {
      status: 'awaiting_plan',
      input_tokens: 1,
      output_tokens: 1,
    });

    await service.runnerUpdate(
      RAW_TOKEN,
      update({
        kind: 'pull_request',
        diff: 'https://github.com/member/repo/pull/7',
        inputTokens: 1,
        outputTokens: 1,
      })
    );
    expect(admin.updateTaskByCallbackHash).toHaveBeenLastCalledWith(hashToken(RAW_TOKEN), {
      status: 'completed',
      pull_request_url: 'https://github.com/member/repo/pull/7',
      input_tokens: 1,
      output_tokens: 1,
    });
  });

  it('refuses an update that would exceed the token cap', async () => {
    const { deps, admin } = harness({}, makeTask({ input_tokens: 199_950 }));
    const service = createCodingService(deps);

    await expect(
      service.runnerUpdate(RAW_TOKEN, update({ inputTokens: 200_001 }))
    ).rejects.toMatchObject({ code: 'budget_exhausted', statusCode: 402 });
    expect(admin.updateTaskByCallbackHash).toHaveBeenCalledWith(hashToken(RAW_TOKEN), {
      status: 'failed',
      failure_code: 'budget_exhausted',
    });
    expect(admin.insertStepForRunner).not.toHaveBeenCalled();
  });

  it('refuses an LLM request once the input cap is spent', async () => {
    const { deps, llm } = harness({}, makeTask({ input_tokens: 199_999 }));
    const service = createCodingService(deps);

    await expect(
      service.runnerLlm(RAW_TOKEN, { messages: [{ role: 'user', content: 'x'.repeat(200) }] })
    ).rejects.toMatchObject({ code: 'budget_exhausted' });
    expect(llm.reply).not.toHaveBeenCalled();
  });

  it('forwards tools, keeps provider usage and refuses an over-cap answer', async () => {
    const { deps, llm } = harness();
    const service = createCodingService(deps);
    const tools = [
      { type: 'function', function: { name: 'read_file', description: '', parameters: {} } },
    ];

    const answer = await service.runnerLlm(RAW_TOKEN, {
      messages: [{ role: 'user', content: 'read it' }],
      tools,
    });

    expect(llm.reply).toHaveBeenCalledWith(
      { messages: [{ role: 'user', content: 'read it' }], tools },
      expect.any(AbortSignal)
    );
    expect(answer).toEqual({
      message: { role: 'assistant', content: 'done' },
      usage: { inputTokens: 10, outputTokens: 5 },
      model: 'deepseek-v4.1-flash',
    });

    llm.reply.mockResolvedValueOnce({
      message: { role: 'assistant', content: 'x'.repeat(40_000) },
      usage: { inputTokens: 199_990, outputTokens: 30_000 },
    });
    await expect(
      service.runnerLlm(RAW_TOKEN, { messages: [{ role: 'user', content: 'more' }] })
    ).rejects.toMatchObject({ code: 'budget_exhausted' });
  });
});

describe('CodingService local companion (ADR-0222)', () => {
  const LOCAL_WORKSPACE = '00000000-0000-4000-8000-000000000009';
  const GRANT = '00000000-0000-4000-8000-00000000000a';
  const localWorkspace: CodingWorkspaceRow = {
    ...workspace,
    id: LOCAL_WORKSPACE,
    kind: 'local',
    installation_id: null,
    repo_owner: null,
    repo_name: null,
    default_branch: null,
    device_label: 'laptop',
  };
  const localTask = makeTask({ workspace_id: LOCAL_WORKSPACE, branch: null });
  const grantRow = {
    id: GRANT,
    user_id: USER,
    device_label: 'laptop',
    pair_code_hash: null,
    pair_expires_at: null,
    token_hash: hashToken('grant-token-abcdefghijklmnopqrstuvwxyz'),
    workspace_id: LOCAL_WORKSPACE,
    created_at: CREATED_AT,
    claimed_at: CREATED_AT,
    last_seen_at: null,
    revoked_at: null,
  };

  it('stores only the digest of a pairing code', async () => {
    const { deps, admin } = harness();
    const service = createCodingService(deps);

    const pair = await service.createLocalPair(USER, { deviceLabel: 'laptop' });

    expect(pair.code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    const call = (admin.createLocalPair as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      { codeHash: string; deviceLabel: string; expiresAt: string },
    ];
    expect(call[1].deviceLabel).toBe('laptop');
    expect(call[1].codeHash).not.toBe(pair.code);
    expect(call[1].codeHash).not.toContain(pair.code.replace('-', ''));
    expect(Date.parse(call[1].expiresAt)).toBeGreaterThan(Date.parse('2026-11-15T12:00:00.000Z'));
  });

  it('refuses a code it cannot resolve', async () => {
    const { deps } = harness();
    const service = createCodingService(deps);

    await expect(service.claimLocalPair({ code: 'AAAA-BBBB' })).rejects.toMatchObject({
      code: 'invalid_code',
      statusCode: 400,
    });
  });

  it('pairs a device into a local workspace and returns the origin', async () => {
    const { deps, admin } = harness();
    (admin.findLocalPair as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...grantRow,
      token_hash: null,
      claimed_at: null,
      workspace_id: null,
      pair_code_hash: 'digest',
      pair_expires_at: '2026-11-15T12:10:00.000Z',
    });
    (admin.createLocalWorkspace as ReturnType<typeof vi.fn>).mockResolvedValue(localWorkspace);
    (admin.claimLocalPair as ReturnType<typeof vi.fn>).mockResolvedValue(grantRow);
    const service = createCodingService(deps);

    const result = await service.claimLocalPair({ code: 'abcd-2345', deviceLabel: 'workstation' });

    expect(admin.createLocalWorkspace).toHaveBeenCalledWith(USER, { deviceLabel: 'workstation' });
    expect(result.token.length).toBeGreaterThanOrEqual(20);
    expect(result.apiUrl).toBe('https://noor.test');
    expect(result.runnerUrl).toBe('https://noor.test/coding/runner-v1.mjs');
    expect(result.grant.workspaceId).toBe(LOCAL_WORKSPACE);
    const claim = (admin.claimLocalPair as ReturnType<typeof vi.fn>).mock.calls[0] as [
      string,
      { tokenHash: string; workspaceId: string },
    ];
    expect(claim[1].tokenHash).toBe(hashToken(result.token));
    expect(claim[1].workspaceId).toBe(LOCAL_WORKSPACE);
  });

  it('queues a local task without dispatching anything', async () => {
    const { deps, repo, runner, admin } = harness();
    (repo.findWorkspace as ReturnType<typeof vi.fn>).mockResolvedValue(localWorkspace);
    (repo.createTask as ReturnType<typeof vi.fn>).mockResolvedValue(localTask);
    (admin.findActiveGrantForWorkspace as ReturnType<typeof vi.fn>).mockResolvedValue(grantRow);
    const service = createCodingService(deps);

    const created = await service.createTask(USER, {
      ...createInput,
      workspaceId: LOCAL_WORKSPACE,
    });

    expect(created.status).toBe('queued');
    expect(created.branch).toBeNull();
    expect(runner.start).not.toHaveBeenCalled();
    expect(repo.updateTask).not.toHaveBeenCalled();
  });

  it('refuses a local task when the device was revoked', async () => {
    const { deps, repo } = harness();
    (repo.findWorkspace as ReturnType<typeof vi.fn>).mockResolvedValue(localWorkspace);
    const service = createCodingService(deps);

    await expect(
      service.createTask(USER, { ...createInput, workspaceId: LOCAL_WORKSPACE })
    ).rejects.toMatchObject({ code: 'device_not_paired', statusCode: 409 });
  });

  it('claims the next queued task for a paired device', async () => {
    const { deps, admin, repo } = harness();
    (admin.findLocalGrantByTokenHash as ReturnType<typeof vi.fn>).mockResolvedValue(grantRow);
    (admin.claimNextLocalTask as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...localTask,
      status: 'running',
    });
    (repo.findWorkspace as ReturnType<typeof vi.fn>).mockResolvedValue(localWorkspace);
    const service = createCodingService(deps);

    const claimed = await service.claimLocalTask('grant-token-abcdefghijklmnopqrstuvwxyz');

    expect(claimed?.spec.kind).toBe('local');
    expect(claimed?.spec.branch).toBeNull();
    expect(claimed?.spec.handoffToken).toBeNull();
    expect(claimed?.spec.callbackUrl).toBe('https://noor.test/api/coding/runner');
    expect(admin.touchLocalGrant).toHaveBeenCalledWith(GRANT, expect.any(String));
  });

  it('answers null when no task is waiting and refuses a revoked grant', async () => {
    const { deps, admin } = harness();
    (admin.findLocalGrantByTokenHash as ReturnType<typeof vi.fn>).mockResolvedValue(grantRow);
    const service = createCodingService(deps);

    await expect(
      service.claimLocalTask('grant-token-abcdefghijklmnopqrstuvwxyz')
    ).resolves.toBeNull();

    (admin.findLocalGrantByTokenHash as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...grantRow,
      revoked_at: '2026-11-15T12:00:00.000Z',
    });
    await expect(
      service.claimLocalTask('grant-token-abcdefghijklmnopqrstuvwxyz')
    ).rejects.toMatchObject({ code: 'invalid_token', statusCode: 401 });
  });

  it('fails the work still in flight when a device is revoked', async () => {
    const { deps, admin } = harness();
    (admin.listLocalGrants as ReturnType<typeof vi.fn>).mockResolvedValue([grantRow]);
    const service = createCodingService(deps);

    await service.revokeLocalGrant(USER, GRANT);

    expect(admin.revokeLocalGrant).toHaveBeenCalledWith(USER, GRANT, expect.any(String));
    expect(admin.failActiveTasksForWorkspace).toHaveBeenCalledWith(
      USER,
      LOCAL_WORKSPACE,
      'runner_failed'
    );
  });

  it('completes a local task when the review diff is posted', async () => {
    const { deps, admin } = harness();
    (admin.findTaskByCallbackHash as ReturnType<typeof vi.fn>).mockResolvedValue(localTask);
    const service = createCodingService(deps);

    await service.runnerUpdate(RAW_TOKEN, {
      kind: 'review',
      status: 'applied',
      summary: 'Changed one file.',
      diff: 'diff --git a/a b/a',
      failureCode: null,
      inputTokens: 10,
      outputTokens: 5,
    });

    expect(admin.updateTaskByCallbackHash).toHaveBeenLastCalledWith(hashToken(RAW_TOKEN), {
      status: 'completed',
      input_tokens: 10,
      output_tokens: 5,
    });
  });
});

describe('CodingService multi-repository workspaces (ADR-0223)', () => {
  const GROUP = '00000000-0000-4000-8000-00000000000b';
  const REPO_A = '00000000-0000-4000-8000-00000000000c';
  const REPO_B = '00000000-0000-4000-8000-00000000000d';
  const groupWorkspace: CodingWorkspaceRow = {
    ...workspace,
    id: GROUP,
    kind: 'group',
    installation_id: null,
    repo_owner: null,
    repo_name: null,
    default_branch: null,
    group_name: 'app and api',
  };
  const repoA: CodingWorkspaceRepoRow = {
    ...workspaceRepo,
    id: REPO_A,
    workspace_id: GROUP,
    repo_owner: 'member',
    repo_name: 'web',
  };
  const repoB: CodingWorkspaceRepoRow = {
    ...workspaceRepo,
    id: REPO_B,
    workspace_id: GROUP,
    repo_owner: 'member',
    repo_name: 'api',
  };

  it('refuses a set whose repositories do not share one installation', async () => {
    const { deps } = harness({
      installationIdForRepo: async (_userId, owner) => (owner === 'member' ? 42 : 43),
    });
    (deps.admin.findInstallation as ReturnType<typeof vi.fn>).mockImplementation(
      async (_userId: string, id: number) => ({ installation_id: id })
    );
    deps.github.listRepos = vi.fn().mockResolvedValue([
      { owner: 'member', name: 'web', default_branch: 'main' },
      { owner: 'other', name: 'api', default_branch: 'main' },
    ]);
    const service = createCodingService(deps);

    await expect(
      service.addWorkspace(USER, {
        kind: 'group',
        name: 'two owners',
        repos: [
          { owner: 'member', name: 'web' },
          { owner: 'other', name: 'api' },
        ],
      })
    ).rejects.toMatchObject({ code: 'repo_set_invalid' });
  });

  it('creates a group and bootstraps every repository', async () => {
    const bootstrapWorkflow = vi.fn().mockResolvedValue('https://github.com/member/pr/1');
    const { deps } = harness({ bootstrapWorkflow });
    deps.github.listRepos = vi.fn().mockResolvedValue([
      { owner: 'member', name: 'web', default_branch: 'main' },
      { owner: 'member', name: 'api', default_branch: 'main' },
    ]);
    (deps.repo.createWorkspaceGroup as ReturnType<typeof vi.fn>).mockResolvedValue(groupWorkspace);
    (deps.repo.listWorkspaceRepos as ReturnType<typeof vi.fn>).mockResolvedValue([repoA, repoB]);
    const service = createCodingService(deps);

    const result = await service.addWorkspace(USER, {
      kind: 'group',
      name: 'app and api',
      repos: [
        { owner: 'member', name: 'web' },
        { owner: 'member', name: 'api' },
      ],
    });

    expect(deps.repo.createWorkspaceGroup).toHaveBeenCalledWith(USER, {
      name: 'app and api',
      repos: [
        { installationId: 42, repoOwner: 'member', repoName: 'web', defaultBranch: 'main' },
        { installationId: 42, repoOwner: 'member', repoName: 'api', defaultBranch: 'main' },
      ],
    });
    expect(bootstrapWorkflow).toHaveBeenCalledTimes(2);
    expect(result.kind).toBe('group');
    expect(result.name).toBe('app and api');
    expect(result.repos.map((repo) => repo.fullName)).toEqual(['member/web', 'member/api']);
    expect(result.bootstrapPrUrls).toHaveLength(2);
  });

  it('creates one task row and one branch per selected repository', async () => {
    const { deps, repo, runner } = harness();
    (repo.findWorkspace as ReturnType<typeof vi.fn>).mockResolvedValue(groupWorkspace);
    (repo.listWorkspaceRepos as ReturnType<typeof vi.fn>).mockResolvedValue([repoA, repoB]);
    const service = createCodingService(deps);

    await service.createTask(USER, {
      ...createInput,
      workspaceId: GROUP,
      repoIds: [REPO_A, REPO_B],
    });

    expect(repo.createTaskRepo).toHaveBeenCalledTimes(2);
    expect(repo.createTaskRepo).toHaveBeenNthCalledWith(1, USER, {
      taskId: TASK,
      workspaceRepoId: REPO_A,
      repoOwner: 'member',
      repoName: 'web',
      baseBranch: 'main',
      branch: `noor/${TASK.slice(0, 8)}`,
    });
    const [spec] = runner.start.mock.calls[0] as [CodingRunnerTask];
    expect(spec.repos.map((entry) => entry.fullName)).toEqual(['member/web', 'member/api']);
    expect(spec.repos.every((entry) => entry.branch === `noor/${TASK.slice(0, 8)}`)).toBe(true);
    expect(spec.reviewer).toBeNull();
  });

  it('completes only when every repository has a pull request', async () => {
    const { deps, admin } = harness();
    (admin.listTaskRepos as ReturnType<typeof vi.fn>).mockResolvedValue([
      makeTaskRepo({ id: REPO_A, pull_request_url: 'https://github.com/member/web/pull/1' }),
      makeTaskRepo({ id: REPO_B, repo_name: 'api' }),
    ]);
    (admin.findTaskRepoByFullName as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeTaskRepo({ id: REPO_B, repo_name: 'api' })
    );
    const service = createCodingService(deps);

    await service.runnerUpdate(RAW_TOKEN, {
      kind: 'pull_request',
      status: 'applied',
      summary: 'Pull request: https://github.com/member/api/pull/2',
      diff: 'https://github.com/member/api/pull/2',
      repo: 'member/api',
      failureCode: null,
      inputTokens: 1,
      outputTokens: 1,
    });

    expect(admin.updateTaskRepo).toHaveBeenCalledWith(USER, REPO_B, {
      status: 'completed',
      pull_request_url: 'https://github.com/member/api/pull/2',
    });
    expect(admin.updateTaskByCallbackHash).not.toHaveBeenCalledWith(
      hashToken(RAW_TOKEN),
      expect.objectContaining({ status: 'completed' })
    );

    (admin.listTaskRepos as ReturnType<typeof vi.fn>).mockResolvedValue([
      makeTaskRepo({ id: REPO_A, pull_request_url: 'https://github.com/member/web/pull/1' }),
      makeTaskRepo({
        id: REPO_B,
        repo_name: 'api',
        pull_request_url: 'https://github.com/member/api/pull/2',
      }),
    ]);
    await service.runnerUpdate(RAW_TOKEN, {
      kind: 'pull_request',
      status: 'applied',
      summary: 'All pull requests are open.',
      diff: 'https://github.com/member/api/pull/2',
      repo: 'member/api',
      failureCode: null,
      inputTokens: 0,
      outputTokens: 0,
    });
    expect(admin.updateTaskByCallbackHash).toHaveBeenLastCalledWith(
      hashToken(RAW_TOKEN),
      expect.objectContaining({ status: 'completed' })
    );
  });

  it('records the reviewer model, latency and list-price cost on its step', async () => {
    const { deps, admin } = harness();
    const service = createCodingService(deps);

    await service.runnerUpdate(RAW_TOKEN, {
      kind: 'reviewer',
      status: 'applied',
      summary: 'No blocking findings.',
      diff: '{"blocking":[]}',
      failureCode: null,
      inputTokens: 1000,
      outputTokens: 1000,
      model: 'claude-haiku-5-5',
      latencyMs: 1200,
    });

    expect(admin.insertStepForRunner).toHaveBeenCalledWith(
      USER,
      expect.objectContaining({
        kind: 'reviewer',
        model: 'claude-haiku-5-5',
        latencyMs: 1200,
        costUsd: 0.006,
      })
    );
  });

  it('refuses a reviewer request while the committed gate is off', async () => {
    const reviewerLlm = {
      model: 'claude-haiku-5-5',
      reply: vi.fn(),
    };
    const { deps } = harness({ reviewerLlm });
    const service = createCodingService(deps);

    await expect(
      service.runnerLlm(RAW_TOKEN, {
        purpose: 'reviewer',
        messages: [{ role: 'user', content: 'review this' }],
      })
    ).rejects.toMatchObject({ code: 'review_unavailable' });
    expect(reviewerLlm.reply).not.toHaveBeenCalled();
  });
});

describe('CodingService approval gates and bootstrap', () => {
  it('opens a bootstrap PR once when a workspace is connected', async () => {
    const bootstrapWorkflow = vi.fn().mockResolvedValue('https://github.com/member/repo/pull/1');
    const service = createCodingService(harness({ bootstrapWorkflow }).deps);

    const result = await service.addWorkspace(USER, { owner: 'member', name: 'repo' });

    expect(bootstrapWorkflow).toHaveBeenCalledWith({
      installationId: 42,
      owner: 'member',
      name: 'repo',
      defaultBranch: 'main',
    });
    expect(result.bootstrapPrUrls).toEqual(['https://github.com/member/repo/pull/1']);
  });

  it('stores a push request as a proposal and waits for approval', async () => {
    const { deps, admin, repo } = harness();
    const service = createCodingService(deps);
    (admin.findTaskByCallbackHash as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeTask({ status: 'running' })
    );

    await service.runnerUpdate(RAW_TOKEN, {
      kind: 'push',
      status: 'running',
      summary: 'Requesting push',
      diff: null,
      failureCode: null,
      inputTokens: 0,
      outputTokens: 0,
    });

    expect(admin.insertStepForRunner).toHaveBeenCalledWith(
      USER,
      expect.objectContaining({ kind: 'push', status: 'proposed' })
    );
    expect(admin.updateTaskByCallbackHash).toHaveBeenCalledWith(
      hashToken(RAW_TOKEN),
      expect.objectContaining({ status: 'awaiting_push' })
    );

    (repo.findProposedStep as ReturnType<typeof vi.fn>).mockResolvedValue(
      makeStep({ kind: 'push' })
    );
    await service.decideStep(USER, TASK, STEP, { decision: 'approve' });
    expect(repo.updateTask).toHaveBeenCalledWith(
      USER,
      TASK,
      expect.objectContaining({ status: 'running' })
    );
  });
});
