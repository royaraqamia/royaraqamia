import { describe, expect, it, vi } from 'vitest';

import {
  chatAgentTool,
  chatAgentToolDeclarations,
  chatAgentToolDefinitions,
  chatAgentToolDefinitionsForTurn,
  CODING_TOOLS_UNAVAILABLE,
  type ChatAgentToolContext,
} from '@/backend/services/chat/chat-agent-tools';
import type { ChatAgentToolsDeps } from '@/backend/services/chat/chat-agent-tools-deps';
import type { CodingTaskDto } from '@/shared/contracts/coding-agent';
import type { ScreenContext } from '@/shared/contracts/screen-context';
import { URL_EXTRACT_UNAVAILABLE, WEB_SEARCH_UNAVAILABLE } from '@/shared/contracts/web-search';
import {
  ADMIN_AGENT_TOOL_NAMES,
  CHAT_AGENT_TOOLS,
  CHAT_AGENT_TOOL_NAMES,
  chatAgentActionSentence,
} from '@/shared/contracts/chat-agent-actions';

const SCREEN: ScreenContext = {
  route: '/notes',
  product: 'notes',
  screenId: 'notes',
  title: 'الملاحظات',
  overlays: [],
  focus: null,
  tab: null,
  fields: {},
  text: '',
  updatedAt: '2026-11-15T09:00:00.000Z',
};

/** What a tool needs from the turn it runs in; no database in this file. */
function turnContext(overrides: Partial<ChatAgentToolContext> = {}): ChatAgentToolContext {
  return { userId: 'user-1', supabase: {} as never, ip: '127.0.0.1', ...overrides };
}

describe('the assistant’s tool registry (#818)', () => {
  it('declares every named tool exactly once, with the kind the contract says', () => {
    expect(
      chatAgentToolDeclarations()
        .map((tool) => tool.name)
        .sort()
    ).toEqual([...CHAT_AGENT_TOOL_NAMES].sort());

    for (const tool of chatAgentToolDeclarations()) {
      expect(tool.kind).toBe(CHAT_AGENT_TOOLS[tool.name].kind);
    }
  });

  it('refuses an argument object that tries to name another member', () => {
    const tool = chatAgentTool('record_expense');
    expect(tool).not.toBeNull();

    const parsed = tool!.schema.safeParse({
      amount: 5,
      category: 'قهوة',
      user_id: 'someone-else',
    });

    // Strict objects are the structural half of "the member is the caller".
    expect(parsed.success).toBe(false);
  });

  it('accepts the same arguments without a member id', () => {
    const parsed = chatAgentTool('record_expense')!.schema.safeParse({
      amount: 5,
      category: 'قهوة',
    });
    expect(parsed.success).toBe(true);
  });

  it('sends every tool as an OpenAI-compatible function with a JSON schema', () => {
    const definitions = chatAgentToolDefinitions();

    expect(definitions).toHaveLength(CHAT_AGENT_TOOL_NAMES.length);
    for (const definition of definitions) {
      expect(definition.type).toBe('function');
      expect(definition.function.name).toBeTruthy();
      expect(definition.function.description).toBeTruthy();
      expect(definition.function.parameters).toMatchObject({ type: 'object' });
    }
  });

  it('declares the screen refresh only when the request brought eyes', () => {
    const names = (input: { hasApps: boolean; hasScreen: boolean }) =>
      chatAgentToolDefinitionsForTurn({
        ...input,
        hasWebSearch: false,
        hasUrlExtract: false,
        isAdmin: false,
      }).map((definition) => definition.function.name);

    expect(names({ hasApps: false, hasScreen: false })).not.toContain('get_screen_context');
    expect(names({ hasApps: false, hasScreen: true })).toContain('get_screen_context');
    // A connected app does not make a screen exist.
    expect(names({ hasApps: true, hasScreen: false })).not.toContain('get_screen_context');
  });

  it('declares no admin capability to a member’s turn', () => {
    const names = chatAgentToolDefinitionsForTurn({
      hasApps: false,
      hasScreen: false,
      hasWebSearch: false,
      hasUrlExtract: false,
      isAdmin: false,
    }).map((definition) => definition.function.name);

    for (const adminName of ADMIN_AGENT_TOOL_NAMES) {
      expect(names).not.toContain(adminName);
    }

    const adminNames = chatAgentToolDefinitionsForTurn({
      hasApps: false,
      hasScreen: false,
      hasWebSearch: false,
      hasUrlExtract: false,
      isAdmin: true,
    }).map((definition) => definition.function.name);

    for (const adminName of ADMIN_AGENT_TOOL_NAMES) {
      expect(adminNames).toContain(adminName);
    }
  });

  it('re-reads the snapshot of the turn that called it, never an older one', async () => {
    const tool = chatAgentTool('get_screen_context')!;
    const older = { ...SCREEN, route: '/notes/draft', updatedAt: '2026-11-15T08:00:00.000Z' };
    const newer = { ...SCREEN, route: '/notes', updatedAt: '2026-11-15T09:00:00.000Z' };
    const answerFor = async (screen: typeof SCREEN) =>
      (await tool.run({}, turnContext({ screen }))) as { screen: string; updatedAt: string };

    const second = await answerFor(newer);
    const first = await answerFor(older);

    expect(second.updatedAt).toBe(newer.updatedAt);
    expect(second.screen).toContain('المسار: /notes');
    expect(second.screen).not.toContain('/notes/draft');
    expect(first.screen).toContain('المسار: /notes/draft');
    expect(second.screen).not.toBe(first.screen);
  });

  it('answers a turn with no snapshot at all, rather than a stale page', async () => {
    const answer = await chatAgentTool('get_screen_context')!.run({}, turnContext());

    expect(answer).toEqual({ screen: null, updatedAt: null });
  });

  it('words a proposal in the member’s language, whatever the arguments are', () => {
    expect(chatAgentActionSentence('record_expense', { amount: 12.5, currency: 'USD' })).toBe(
      'تسجيل مصروف — 12.5 USD'
    );
    expect(chatAgentActionSentence('create_habit', { name: 'قراءة' })).toContain('قراءة');

    // A proposal with unreadable arguments — the case confirm refuses — must
    // still draw something rather than take the thread down.
    expect(chatAgentActionSentence('record_expense', null)).toBe('تسجيل مصروف');
    expect(chatAgentActionSentence('nonsense', {})).toBe('إجراء');
  });

  it('shows the fact on a remember card, so the member confirms what will be kept', () => {
    expect(chatAgentActionSentence('remember', { text: 'أحبّ القهوة السادة' })).toBe(
      'حفظ ما أوصيت به — «أحبّ القهوة السادة»'
    );
    expect(chatAgentActionSentence('remember', {})).toBe('حفظ ما أوصيت به');
  });

  it('refuses a fact the row cannot hold, and one that names another member', () => {
    const remember = chatAgentTool('remember');
    expect(remember).not.toBeNull();

    expect(remember!.schema.safeParse({ text: 'ا'.repeat(501) }).success).toBe(false);
    expect(remember!.schema.safeParse({ text: 'تذكّر أنني أحبّ القهوة' }).success).toBe(true);
    expect(
      remember!.schema.safeParse({ text: 'أحبّ القهوة', user_id: 'someone-else' }).success
    ).toBe(false);
  });

  it('names the task and the step on a coding card (ADR-0219)', () => {
    const taskId = '00000000-0000-4000-8000-000000000001';
    const stepId = '00000000-0000-4000-8000-000000000002';

    expect(chatAgentActionSentence('start_coding_task', { title: 'إصلاح البحث' })).toBe(
      'بدء مهمة برمجية — «إصلاح البحث»'
    );
    expect(chatAgentActionSentence('coding_task_status', { taskId })).toBe(
      `قراءة حالة مهمة برمجية — ${taskId}`
    );
    expect(chatAgentActionSentence('coding_task_diff', { taskId, stepId })).toBe(
      `قراءة فروق مهمة برمجية — ${taskId} — ${stepId}`
    );
    // The typed target is the step itself, the way a delete names its row.
    expect(chatAgentActionSentence('approve_coding_step', { taskId, stepId })).toContain(stepId);
    expect(chatAgentActionSentence('reject_coding_step', { taskId, stepId })).toContain(stepId);
    expect(chatAgentActionSentence('approve_coding_step', { taskId })).toBe(
      'الموافقة على خطوة برمجية'
    );
  });
});

describe('search_web failure (ADR-0206)', () => {
  it('hands the model the one Arabic sentence, never the vendor’s error text', async () => {
    const searchWeb = vi.fn(async () => {
      throw new Error('search answered 403');
    });
    const tool = chatAgentTool('search_web')!;

    await expect(tool.run({ query: 'سعر الذهب' }, turnContext({ searchWeb }))).rejects.toThrow(
      WEB_SEARCH_UNAVAILABLE
    );
    await expect(tool.run({ query: 'سعر الذهب' }, turnContext({ searchWeb }))).rejects.not.toThrow(
      '403'
    );
  });
});

describe('read_url (ADR-0214)', () => {
  it('is declared only when the deployment has a page reader', () => {
    const names = (hasUrlExtract: boolean) =>
      chatAgentToolDefinitionsForTurn({
        hasApps: false,
        hasScreen: false,
        hasWebSearch: false,
        hasUrlExtract,
        isAdmin: false,
      }).map((definition) => definition.function.name);
    expect(names(false)).not.toContain('read_url');
    expect(names(true)).toContain('read_url');
  });

  it('hands the model one Arabic sentence when a page cannot be read', async () => {
    const readUrl = vi.fn(async () => {
      throw new Error('extract answered 403');
    });
    const tool = chatAgentTool('read_url')!;
    const args = { url: 'https://example.com/a', question: 'ماذا يقول الرابط؟' };

    await expect(tool.run(args, turnContext({ readUrl }))).rejects.toThrow(URL_EXTRACT_UNAVAILABLE);
    await expect(tool.run(args, turnContext({ readUrl }))).rejects.not.toThrow('403');
  });

  it('passes the public address and the question to the reader', async () => {
    const readUrl = vi.fn(async () => ({ sources: [], evidence: '' }));
    const tool = chatAgentTool('read_url')!;
    const args = { url: 'https://example.com/a', question: 'لخّص المقال' };
    await tool.run(args, turnContext({ readUrl }));
    expect(readUrl).toHaveBeenCalledWith(args.url, args.question);
  });
});

describe('the coding agent’s control plane (ADR-0219)', () => {
  const workspaceId = '00000000-0000-4000-8000-000000000001';
  const taskId = '00000000-0000-4000-8000-000000000002';
  const stepId = '00000000-0000-4000-8000-000000000003';
  const task: CodingTaskDto = {
    id: taskId,
    workspaceId,
    title: 'إصلاح البحث',
    instruction: 'أصلح ترتيب نتائج البحث',
    mode: 'plan',
    status: 'awaiting_plan',
    branch: 'noor/12345678',
    pullRequestUrl: null,
    summary: '',
    failureCode: null,
    steps: [
      {
        id: stepId,
        kind: 'plan',
        status: 'proposed',
        summary: 'خطة التغيير',
        diff: '+ سطر واحد',
        createdAt: '2026-11-25T00:00:00.000Z',
      },
    ],
    createdAt: '2026-11-25T00:00:00.000Z',
    updatedAt: '2026-11-25T00:00:00.000Z',
  };

  function wiredDeps(
    overrides: {
      createTask?: (...args: unknown[]) => Promise<CodingTaskDto>;
      getTask?: (...args: unknown[]) => Promise<CodingTaskDto>;
      listTasks?: (...args: unknown[]) => Promise<{ tasks: CodingTaskDto[]; nextCursor: null }>;
      decideStep?: (...args: unknown[]) => Promise<CodingTaskDto>;
    } = {}
  ): ChatAgentToolsDeps {
    return {
      coding: {
        createTask: overrides.createTask ?? vi.fn(async () => task),
        getTask: overrides.getTask ?? vi.fn(async () => task),
        listTasks: overrides.listTasks ?? vi.fn(async () => ({ tasks: [task], nextCursor: null })),
        decideStep: overrides.decideStep ?? vi.fn(async () => task),
      },
    } as unknown as ChatAgentToolsDeps;
  }

  it('starts a task as the caller and answers with its id, status and branch', async () => {
    const createTask = vi.fn(async () => task);
    const tool = chatAgentTool('start_coding_task')!;
    const args = {
      workspaceId,
      title: 'إصلاح البحث',
      instruction: 'أصلح ترتيب نتائج البحث',
      mode: 'plan',
    };

    const answer = (await tool.run(args, turnContext({ deps: wiredDeps({ createTask }) }))) as {
      taskId: string;
      status: string;
      branch: string;
    };

    expect(answer).toEqual({ taskId, status: 'awaiting_plan', branch: 'noor/12345678' });
    expect(createTask).toHaveBeenCalledWith('user-1', { ...args, baseBranch: 'main' });
  });

  it('refuses a task that tries to name another member or skip a uuid', () => {
    const tool = chatAgentTool('start_coding_task')!;
    const args = { workspaceId, title: 'إصلاح البحث', instruction: 'أصلح', mode: 'plan' };

    expect(tool.schema.safeParse({ ...args, user_id: 'someone-else' }).success).toBe(false);
    expect(tool.schema.safeParse({ ...args, workspaceId: 'not-a-uuid' }).success).toBe(false);
    expect(tool.schema.safeParse({ ...args, mode: 'full' }).success).toBe(true);
  });

  it('reads one task by id or lists recent tasks without one', async () => {
    const getTask = vi.fn(async () => task);
    const listTasks = vi.fn(async () => ({ tasks: [task], nextCursor: null }));
    const context = turnContext({ deps: wiredDeps({ getTask, listTasks }) });
    const tool = chatAgentTool('coding_task_status')!;

    expect(await tool.run({ taskId }, context)).toEqual(task);
    expect(getTask).toHaveBeenCalledWith('user-1', taskId);
    expect(await tool.run({}, context)).toEqual([task]);
    expect(listTasks).toHaveBeenCalledWith('user-1', { limit: 50 });
  });

  it('returns the step diffs, narrowed to one step when asked', async () => {
    const tool = chatAgentTool('coding_task_diff')!;
    const context = turnContext({ deps: wiredDeps() });

    expect(await tool.run({ taskId }, context)).toEqual([
      {
        id: stepId,
        kind: 'plan',
        status: 'proposed',
        summary: 'خطة التغيير',
        diff: '+ سطر واحد',
      },
    ]);
    expect(await tool.run({ taskId, stepId }, context)).toHaveLength(1);
    expect(
      await tool.run({ taskId, stepId: '00000000-0000-4000-8000-000000000009' }, context)
    ).toEqual([]);
  });

  it('passes the member’s approve or reject to the step decision', async () => {
    const decideStep = vi.fn(async () => task);
    const context = turnContext({ deps: wiredDeps({ decideStep }) });
    const args = { taskId, stepId };

    await chatAgentTool('approve_coding_step')!.run(args, context);
    expect(decideStep).toHaveBeenCalledWith('user-1', taskId, stepId, { decision: 'approve' });

    await chatAgentTool('reject_coding_step')!.run(args, context);
    expect(decideStep).toHaveBeenCalledWith('user-1', taskId, stepId, { decision: 'reject' });
  });

  it('stays declared but refuses in Arabic when the coding service is absent', async () => {
    for (const name of [
      'start_coding_task',
      'coding_task_status',
      'coding_task_diff',
      'approve_coding_step',
      'reject_coding_step',
    ]) {
      expect(
        chatAgentToolDefinitionsForTurn({
          hasApps: false,
          hasScreen: false,
          hasWebSearch: false,
          hasUrlExtract: false,
          isAdmin: false,
        }).map((definition) => definition.function.name)
      ).toContain(name);

      const tool = chatAgentTool(name)!;
      expect(await tool.run({}, turnContext())).toBe(CODING_TOOLS_UNAVAILABLE);
      expect(await tool.run({}, turnContext({ deps: {} as ChatAgentToolsDeps }))).toBe(
        CODING_TOOLS_UNAVAILABLE
      );
    }
  });
});
