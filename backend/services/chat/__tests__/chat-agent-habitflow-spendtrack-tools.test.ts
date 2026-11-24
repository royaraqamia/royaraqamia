import { beforeEach, describe, expect, it, vi } from 'vitest';

import { chatAgentTool, type ChatAgentToolContext } from '@/backend/services/chat/chat-agent-tools';
import { toolsDepsFor } from '@/backend/services/chat/__tests__/support/tools-deps';
import {
  deleteHabitHandler,
  getLogsHandler,
  listHabitsHandler,
  toggleLogHandler,
  updateHabitHandler,
} from '@/backend/services/mcp/tools/habitflow';
import {
  createCategoryHandler,
  deleteExpenseHandler,
  getSummaryHandler,
  listBudgetsHandler,
  listCategoriesHandler,
  listTransactionsHandler,
  setBudgetHandler,
} from '@/backend/services/mcp/tools/spendtrack';
import { CHAT_AGENT_TOOLS, chatAgentActionSentence } from '@/shared/contracts/chat-agent-actions';

/**
 * The rest of HabitFlow's and SpendTrack's hands (issue #1432).
 *
 * Both doors call the same MCP handlers and read their `structuredContent`
 * beside the markdown (ADR-0183's amendment), so a capability cannot answer
 * differently by door. The two writes the turn already had keep their names:
 * `record_expense` and `edit_expense` are the registry's create/update expense
 * capabilities; they are covered by the registry test, not retested here.
 */

vi.mock('@/backend/services/mcp/tools/habitflow', () => ({
  listHabitsHandler: vi.fn(),
  getLogsHandler: vi.fn(),
  updateHabitHandler: vi.fn(),
  toggleLogHandler: vi.fn(),
  deleteHabitHandler: vi.fn(),
}));

vi.mock('@/backend/services/mcp/tools/spendtrack', () => ({
  listCategoriesHandler: vi.fn(),
  listTransactionsHandler: vi.fn(),
  getSummaryHandler: vi.fn(),
  listBudgetsHandler: vi.fn(),
  createCategoryHandler: vi.fn(),
  setBudgetHandler: vi.fn(),
  deleteExpenseHandler: vi.fn(),
}));

// Product-service fakes, handed to the catalogue through `ChatAgentToolsDeps`.
const createHabitService = vi.fn();
const createSpendtrackService = vi.fn();

const deps = toolsDepsFor({
  habits: { createService: createHabitService },
  spendtrack: { createService: createSpendtrackService },
});

function turnContext(): ChatAgentToolContext {
  return { userId: 'user-1', supabase: {} as never, ip: '127.0.0.1', deps };
}

function answer(value: Record<string, unknown>) {
  return { content: [{ type: 'text' as const, text: '# markdown' }], structuredContent: value };
}

const habitService = {
  getAllHabits: vi.fn(async () => [] as Array<{ id: string; name: string }>),
};

const spendService = {
  getUserCategories: vi.fn(async () => [] as Array<{ id: string; name: string }>),
  getTransactions: vi.fn(async () => ({ expenses: [] as Array<Record<string, unknown>> })),
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(createHabitService).mockReturnValue({ service: habitService } as never);
  vi.mocked(createSpendtrackService).mockReturnValue(spendService as never);
  habitService.getAllHabits.mockResolvedValue([]);
  spendService.getUserCategories.mockResolvedValue([]);
  spendService.getTransactions.mockResolvedValue({ expenses: [] });
});

const READS = [
  'list_habits',
  'get_logs',
  'list_categories',
  'list_transactions',
  'get_summary',
  'list_budgets',
] as const;

describe('the HabitFlow and SpendTrack reads (#1432)', () => {
  it('reads the handlers’ structuredContent, never their markdown', async () => {
    for (const name of READS) expect(chatAgentTool(name)?.tier).toBe(0);

    const habits = { habits: [{ id: 'h1', name: 'قراءة' }], total: 1 };
    vi.mocked(listHabitsHandler).mockResolvedValue(answer(habits));
    expect(await chatAgentTool('list_habits')!.run({ limit: 5 }, turnContext())).toEqual(habits);
    expect(vi.mocked(listHabitsHandler).mock.calls[0]![0]).toEqual({
      page_size: 5,
      offset: 0,
      format: 'json',
    });
    expect(vi.mocked(listHabitsHandler).mock.calls[0]![1].scopes).toEqual(['habitflow.read']);

    const logs = { logs: [{ id: 'l1', date: '2026-11-01', completed: true }], total: 1 };
    vi.mocked(getLogsHandler).mockResolvedValue(answer(logs));
    expect(
      await chatAgentTool('get_logs')!.run(
        { start: '2026-11-01', end: '2026-11-07' },
        turnContext()
      )
    ).toEqual(logs);
    expect(vi.mocked(getLogsHandler).mock.calls[0]![0]).toMatchObject({
      start: '2026-11-01',
      end: '2026-11-07',
      format: 'json',
    });

    const categories = { categories: [{ id: 'c1', name: 'قهوة' }] };
    vi.mocked(listCategoriesHandler).mockResolvedValue(answer(categories));
    expect(await chatAgentTool('list_categories')!.run({}, turnContext())).toEqual(categories);
    expect(vi.mocked(listCategoriesHandler).mock.calls[0]![1].scopes).toEqual(['spendtrack.read']);

    const summary = { month: '2026-11', total: 120, categoryBreakdown: [] };
    vi.mocked(getSummaryHandler).mockResolvedValue(answer(summary));
    expect(await chatAgentTool('get_summary')!.run({ month: '2026-11' }, turnContext())).toEqual(
      summary
    );
    expect(vi.mocked(getSummaryHandler).mock.calls[0]![0]).toEqual({
      month: '2026-11',
      format: 'json',
    });

    const budgets = { month: '2026-11', budgets: [{ categoryId: null, amount: 500 }] };
    vi.mocked(listBudgetsHandler).mockResolvedValue(answer(budgets));
    expect(await chatAgentTool('list_budgets')!.run({}, turnContext())).toEqual(budgets);
    expect(vi.mocked(listBudgetsHandler).mock.calls[0]![0]).toEqual({ format: 'json' });
  });

  it('returns the individual transactions behind the coffee answer', async () => {
    // The answer must be able to add these rows; a month total alone cannot
    // say what was spent on coffee (issue #1432's acceptance).
    const value = {
      expenses: [
        { id: 'e1', date: '2026-11-03', amount: 12, description: 'قهوة الصباح' },
        { id: 'e2', date: '2026-11-14', amount: 15, description: 'قهوة' },
      ],
      total: 2,
    };
    vi.mocked(listTransactionsHandler).mockResolvedValue(answer(value));

    expect(
      await chatAgentTool('list_transactions')!.run(
        { search: 'قهوة', start: '2026-11-01', end: '2026-11-30' },
        turnContext()
      )
    ).toEqual(value);
    expect(vi.mocked(listTransactionsHandler).mock.calls[0]![0]).toEqual({
      search: 'قهوة',
      start: '2026-11-01',
      end: '2026-11-30',
      page_size: 100,
      offset: 0,
      format: 'json',
    });
    expect(vi.mocked(listTransactionsHandler).mock.calls[0]![1].scopes).toEqual([
      'spendtrack.read',
    ]);
  });

  it('keeps every new hand strict about who is calling', () => {
    for (const name of [
      ...READS,
      'update_habit',
      'toggle_log',
      'delete_habit',
      'create_category',
      'set_budget',
      'delete_expense',
    ]) {
      const schema = chatAgentTool(name)!.schema;
      expect(schema.safeParse({ user_id: 'someone-else' }).success).toBe(false);
    }
    expect(
      chatAgentTool('list_transactions')!.schema.safeParse({ start: 'not-a-date' }).success
    ).toBe(false);
  });
});

describe('the tier-1 hands (#1432)', () => {
  it('forwards a habit patch and a log toggle through the same handler', async () => {
    const updated = { id: 'h1', name: 'قراءة الكتب' };
    vi.mocked(updateHabitHandler).mockResolvedValue(answer(updated));
    expect(
      await chatAgentTool('update_habit')!.run(
        { id: 'h1', name: 'قراءة الكتب', reminder_time: null },
        turnContext()
      )
    ).toEqual(updated);
    expect(vi.mocked(updateHabitHandler).mock.calls[0]![0]).toEqual({
      id: 'h1',
      name: 'قراءة الكتب',
      reminder_time: null,
      format: 'json',
    });
    expect(vi.mocked(updateHabitHandler).mock.calls[0]![1].scopes).toEqual(['habitflow.write']);

    const log = { id: 'l1', habitId: 'h1', date: '2026-11-17', completed: true };
    vi.mocked(toggleLogHandler).mockResolvedValue(answer(log));
    expect(
      await chatAgentTool('toggle_log')!.run(
        { habit_id: 'h1', date: '2026-11-17', completed: true },
        turnContext()
      )
    ).toEqual(log);
    expect(vi.mocked(toggleLogHandler).mock.calls[0]![0]).toEqual({
      habit_id: 'h1',
      date: '2026-11-17',
      completed: true,
      format: 'json',
    });
  });

  it('creates a category with a colour derived from its name when none is given', async () => {
    const created = { name: 'سفر', colorHex: '#3c7a5e' };
    vi.mocked(createCategoryHandler).mockResolvedValue(answer(created));

    expect(await chatAgentTool('create_category')!.run({ name: 'سفر' }, turnContext())).toEqual(
      created
    );
    expect(vi.mocked(createCategoryHandler).mock.calls[0]![0]).toMatchObject({
      name: 'سفر',
      format: 'json',
    });
    expect(vi.mocked(createCategoryHandler).mock.calls[0]![0].color_hex).toMatch(/^#[0-9a-f]{6}$/);
    expect(vi.mocked(createCategoryHandler).mock.calls[0]![1].scopes).toEqual(['spendtrack.write']);
  });

  it('writes a reversible tier-1 budget, resolving a category by its name', async () => {
    const tool = chatAgentTool('set_budget')!;
    expect(tool.tier).toBe(1);
    expect(CHAT_AGENT_TOOLS.set_budget.kind).toBe('write');
    expect(chatAgentActionSentence('set_budget', { month: '2026-11', amount: 500 })).toBe(
      'تحديد ميزانية — 2026-11 — 500'
    );

    spendService.getUserCategories.mockResolvedValue([{ id: 'c1', name: 'قهوة' }]);
    const saved = { month: '2026-11', category_id: 'c1', amount: 500 };
    vi.mocked(setBudgetHandler).mockResolvedValue(answer(saved));

    expect(
      await tool.run({ amount: 500, category: 'قهوة', month: '2026-11' }, turnContext())
    ).toEqual(saved);
    expect(vi.mocked(setBudgetHandler).mock.calls[0]![0]).toEqual({
      month: '2026-11',
      amount: 500,
      category_id: 'c1',
      format: 'json',
    });
    expect(vi.mocked(setBudgetHandler).mock.calls[0]![1].scopes).toEqual(['spendtrack.write']);

    // Re-setting the same month and category is an update, not a delete: a
    // second write with a different amount is how the member undoes the first.
    expect(
      await tool.run({ amount: 400, category: 'قهوة', month: '2026-11' }, turnContext())
    ).toEqual(saved);
    expect(vi.mocked(setBudgetHandler).mock.calls[1]![0]).toMatchObject({ amount: 400 });
  });
});

describe('the tier-3 deletes (#1432)', () => {
  it('names the habit on the card and checks it against the row', async () => {
    const tool = chatAgentTool('delete_habit')!;
    expect(tool.tier).toBe(3);
    expect(chatAgentActionSentence('delete_habit', { name: 'قراءة' })).toContain('«قراءة»');

    habitService.getAllHabits.mockResolvedValue([{ id: 'h1', name: 'قراءة' }]);
    expect(await tool.run({ id: 'h1', name: 'اسم آخر' }, turnContext())).toEqual({
      error: 'اسم العادة غير مطابق',
    });
    expect(deleteHabitHandler).not.toHaveBeenCalled();

    const deleted = { id: 'h1', message: 'Habit archived.' };
    vi.mocked(deleteHabitHandler).mockResolvedValue(answer(deleted));
    expect(await tool.run({ id: 'h1', name: 'قراءة' }, turnContext())).toEqual(deleted);
    expect(vi.mocked(deleteHabitHandler).mock.calls[0]![0]).toEqual({ id: 'h1', format: 'json' });
  });

  it('names the expense on the card and refuses a mismatched target', async () => {
    const tool = chatAgentTool('delete_expense')!;
    expect(tool.tier).toBe(3);
    expect(
      chatAgentActionSentence('delete_expense', { name: 'قهوة الصباح', amount: 12 })
    ).toContain('«قهوة الصباح»');

    const id = '11111111-1111-4111-8111-111111111111';
    const other = '22222222-2222-4222-8222-222222222222';
    spendService.getTransactions.mockResolvedValue({
      expenses: [{ id, description: 'قهوة الصباح', amount: 12 }],
    });
    expect(await tool.run({ expense_id: other, name: 'قهوة الصباح' }, turnContext())).toEqual({
      error: 'لم أجد هذا المصروف',
    });
    expect(await tool.run({ expense_id: id, name: 'صفقة أخرى' }, turnContext())).toEqual({
      error: 'وصف المصروف غير مطابق',
    });
    expect(deleteExpenseHandler).not.toHaveBeenCalled();

    const deleted = { id, message: 'Expense deleted.' };
    vi.mocked(deleteExpenseHandler).mockResolvedValue(answer(deleted));
    expect(await tool.run({ expense_id: id, name: 'قهوة الصباح' }, turnContext())).toEqual(deleted);
    expect(vi.mocked(deleteExpenseHandler).mock.calls[0]![0]).toEqual({ id, format: 'json' });
  });
});
