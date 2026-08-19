import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpUserContext } from '../session';
import { MCP_SERVER_NAME } from '../constants';
import { jsonText, structuredResponse, toolErrorResponse, type ToolResult } from './tool-utils';
import { requireAnyScope, requireUserId } from './guards';
import { createSpendtrackRepository } from '@/backend/repositories/spendtrack';
import {
  buildPaginationMeta,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  ResponseFormatSchema,
} from './shared';

/**
 * SpendTrack read tools. All RPCs and queries pass the caller's own user_id
 * on the user-scoped client; the security-definer RPCs self-check
 * auth.uid() = p_user_id, and the table policies scope rows to the user.
 */

const ListTransactionsInputSchema = z
  .object({
    start: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .describe('Inclusive start date (YYYY-MM-DD)'),
    end: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .describe('Inclusive end date (YYYY-MM-DD)'),
    search: z.string().min(1).optional().describe('Search in description'),
    page_size: z
      .number()
      .int()
      .min(1)
      .max(MAX_PAGE_SIZE)
      .default(DEFAULT_PAGE_SIZE)
      .describe(`Results per page (default ${DEFAULT_PAGE_SIZE})`),
    offset: z.number().int().min(0).default(0).describe('0-based offset for pagination'),
    format: ResponseFormatSchema,
  })
  .strict();

const GetSummaryInputSchema = z
  .object({
    month: z
      .string()
      .regex(/^\d{4}-\d{2}$/)
      .optional()
      .describe('Month to summarize (YYYY-MM, default: current month)'),
    format: ResponseFormatSchema,
  })
  .strict();

const ListCategoriesInputSchema = z.object({ format: ResponseFormatSchema }).strict();

const ListBudgetsInputSchema = z
  .object({
    month: z
      .string()
      .regex(/^\d{4}-\d{2}$/)
      .optional()
      .describe('Month for budgets (YYYY-MM, default: current month)'),
    format: ResponseFormatSchema,
  })
  .strict();

type ListTransactionsInput = z.infer<typeof ListTransactionsInputSchema>;
type GetSummaryInput = z.infer<typeof GetSummaryInputSchema>;
type ListCategoriesInput = z.infer<typeof ListCategoriesInputSchema>;
type ListBudgetsInput = z.infer<typeof ListBudgetsInputSchema>;

function monthRange(month: string): { start: string; end: string } {
  const [year, m] = month.split('-').map(Number) as [number, number];
  const startDate = new Date(Date.UTC(year, m - 1, 1));
  const endDate = new Date(Date.UTC(year, m, 0));
  return {
    start: startDate.toISOString().slice(0, 10),
    end: endDate.toISOString().slice(0, 10),
  };
}

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function formatAmount(amount: number, currency: string | null): string {
  return `${currency ?? 'SAR'} ${amount.toFixed(2)}`;
}

export async function listTransactionsHandler(
  params: ListTransactionsInput,
  ctx: McpUserContext
): Promise<ToolResult> {
  try {
    requireAnyScope(ctx, ['spendtrack.read']);
    const userId = requireUserId(ctx, 'Listing transactions');
    const repo = createSpendtrackRepository(ctx.supabase as never);

    const month = params.start && params.end ? '' : currentMonth();
    const range = params.start && params.end ? null : monthRange(month);
    const start = params.start ?? range?.start ?? monthRange(month).start;
    const end = params.end ?? range?.end ?? monthRange(month).end;

    const result = await repo.getTransactions({
      userId,
      start,
      end,
      filterCategories: [],
      sort: 'date_desc',
      pageSize: params.page_size,
      offset: params.offset,
      search: params.search,
    });

    const expenses = result.expenses.map((e) => ({
      id: e.id,
      date: e.date,
      amount: e.amount,
      currency: e.currency ?? null,
      category: e.categories?.name ?? null,
      description: e.description,
    }));
    const meta = buildPaginationMeta(result.totalCount, expenses.length, params.offset);

    if (params.format === 'json') {
      return structuredResponse(jsonText({ expenses, ...meta }), { expenses, ...meta });
    }

    const lines = [
      `# Transactions (${start} → ${end})`,
      '',
      `Found ${result.totalCount} transaction${result.totalCount === 1 ? '' : 's'}.`,
      '',
    ];
    for (const e of expenses) {
      lines.push(
        `- **${formatAmount(e.amount, e.currency)}** — ${e.category ?? 'uncategorized'} — ${e.date}${
          e.description ? ` — ${e.description}` : ''
        } (\`${e.id}\`)`
      );
    }
    if (meta.has_more) {
      lines.push('', `(Showing ${meta.count} of ${meta.total}; use offset to continue.)`);
    }
    return structuredResponse(lines.join('\n'), { expenses, ...meta });
  } catch (error) {
    return toolErrorResponse(error);
  }
}

export async function getSummaryHandler(
  params: GetSummaryInput,
  ctx: McpUserContext
): Promise<ToolResult> {
  try {
    requireAnyScope(ctx, ['spendtrack.read']);
    const userId = requireUserId(ctx, 'Getting spend summary');
    const repo = createSpendtrackRepository(ctx.supabase as never);

    const month = params.month ?? currentMonth();
    const { start, end } = monthRange(month);

    const [total, breakdown, budgets, daily, currency] = await Promise.all([
      repo.getTotalExpenses(userId, start, end, null),
      repo.getCategoryBreakdown(userId, start, end, null),
      repo.getBudgets(userId, month),
      repo.getDailyTotals(userId, start, end, null),
      repo.getUserCurrency(userId),
    ]);

    const categoryTotals = (breakdown ?? []).map((b) => ({
      categoryId: b.categoryId,
      name: b.name,
      total: b.total,
    }));

    const output = {
      month,
      total: total ?? 0,
      currency: currency ?? 'SAR',
      categoryBreakdown: categoryTotals,
      dailyTotals: daily ?? [],
      budgets: budgets.map((b) => ({ categoryId: b.category_id, amount: b.amount })),
    };

    if (params.format === 'json') {
      return structuredResponse(jsonText(output), output);
    }

    const lines = [
      `# Spend Summary — ${month}`,
      '',
      `- **Total spent**: ${formatAmount(total ?? 0, output.currency)}`,
      '',
      '**By category**',
      ...(categoryTotals.length > 0
        ? categoryTotals.map((c) => `- ${c.name}: ${formatAmount(c.total, output.currency)}`)
        : ['- No expenses recorded']),
      '',
      '**Budgets**',
      ...(output.budgets.length > 0
        ? output.budgets.map(
            (b) => `- ${b.categoryId ?? 'overall'}: ${formatAmount(b.amount, output.currency)}`
          )
        : ['- No budgets set']),
    ];
    return structuredResponse(lines.join('\n'), output);
  } catch (error) {
    return toolErrorResponse(error);
  }
}

export async function listCategoriesHandler(
  params: ListCategoriesInput,
  ctx: McpUserContext
): Promise<ToolResult> {
  try {
    requireAnyScope(ctx, ['spendtrack.read']);
    const userId = requireUserId(ctx, 'Listing categories');
    const repo = createSpendtrackRepository(ctx.supabase as never);
    const categories = await repo.getUserCategories(userId);

    const items = categories.map((c) => ({
      id: c.id,
      name: c.name,
      colorHex: c.colorHex,
      isDefault: c.user_id === null,
    }));

    if (params.format === 'json') {
      return structuredResponse(jsonText(items), { categories: items });
    }

    const lines = ['# Spend Categories', ''];
    for (const c of items) {
      lines.push(`- **${c.name}**${c.isDefault ? ' (default)' : ''} — \`${c.id}\``);
    }
    return structuredResponse(lines.join('\n'), { categories: items });
  } catch (error) {
    return toolErrorResponse(error);
  }
}

export async function listBudgetsHandler(
  params: ListBudgetsInput,
  ctx: McpUserContext
): Promise<ToolResult> {
  try {
    requireAnyScope(ctx, ['spendtrack.read']);
    const userId = requireUserId(ctx, 'Listing budgets');
    const repo = createSpendtrackRepository(ctx.supabase as never);

    const month = params.month ?? currentMonth();
    const budgets = await repo.getBudgets(userId, month);
    const items = budgets.map((b) => ({ categoryId: b.category_id, amount: b.amount }));

    if (params.format === 'json') {
      return structuredResponse(jsonText({ month, budgets: items }), { month, budgets: items });
    }

    const lines = [`# Budgets — ${month}`, ''];
    if (items.length === 0) {
      lines.push('No budgets set for this month.');
    }
    for (const b of items) {
      lines.push(`- ${b.categoryId ?? 'overall'}: ${b.amount.toFixed(2)}`);
    }
    return structuredResponse(lines.join('\n'), { month, budgets: items });
  } catch (error) {
    return toolErrorResponse(error);
  }
}

export function registerSpendTrackTools(server: McpServer, ctx: McpUserContext): void {
  server.registerTool(
    `${MCP_SERVER_NAME}_spendtrack_list_transactions`,
    {
      title: 'List Transactions',
      description: `Lists your expenses in a date range (defaults to the current month). Requires "spendtrack.read" and an authenticated session.

Args:
  - start (string, optional): inclusive start date YYYY-MM-DD
  - end (string, optional): inclusive end date YYYY-MM-DD
  - search (string, optional): search in descriptions
  - page_size (number, default 20, max 100): results per page
  - offset (number, default 0): 0-based pagination offset
  - format ('markdown' | 'json', default 'markdown'): output format

Returns (JSON): { "expenses": Expense[], "total": number, "count": number, "offset": number, "has_more": boolean }

Examples:
  - Use when: "list this month's expenses"
  - Use when: "transactions for July 2026" -> start="2026-07-01", end="2026-07-31"`,
      inputSchema: ListTransactionsInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    (params) => listTransactionsHandler(params, ctx)
  );

  server.registerTool(
    `${MCP_SERVER_NAME}_spendtrack_get_summary`,
    {
      title: 'Get Spend Summary',
      description: `Summarizes spending for a month: total, category breakdown, budgets, and daily totals. Requires "spendtrack.read" and an authenticated session.

Args:
  - month (string, optional): YYYY-MM (default: current month)
  - format ('markdown' | 'json', default 'markdown'): output format

Returns (JSON): { "month": string, "total": number, "currency": string, "categoryBreakdown": {categoryId,name,total}[], "dailyTotals": {date,total}[], "budgets": {categoryId,amount}[] }

Examples:
  - Use when: "how much did I spend this month"
  - Use when: "summary for March 2026" -> month="2026-03"`,
      inputSchema: GetSummaryInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    (params) => getSummaryHandler(params, ctx)
  );

  server.registerTool(
    `${MCP_SERVER_NAME}_spendtrack_list_categories`,
    {
      title: 'List Categories',
      description: `Lists your spending categories (custom + defaults). Requires "spendtrack.read" and an authenticated session.

Args:
  - format ('markdown' | 'json', default 'markdown'): output format

Returns (JSON): { "categories": {id,name,colorHex,isDefault}[] }

Examples:
  - Use when: "what categories do I have"`,
      inputSchema: ListCategoriesInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    (params) => listCategoriesHandler(params, ctx)
  );

  server.registerTool(
    `${MCP_SERVER_NAME}_spendtrack_list_budgets`,
    {
      title: 'List Budgets',
      description: `Lists your budgets for a month. Requires "spendtrack.read" and an authenticated session.

Args:
  - month (string, optional): YYYY-MM (default: current month)
  - format ('markdown' | 'json', default 'markdown'): output format

Returns (JSON): { "month": string, "budgets": {categoryId,amount}[] }

Examples:
  - Use when: "what are my budgets this month"`,
      inputSchema: ListBudgetsInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    (params) => listBudgetsHandler(params, ctx)
  );
}

// ============================================================
// Write tools (spendtrack.write)
// ============================================================

const CreateExpenseInputSchema = z
  .object({
    amount: z.number().positive().describe('Expense amount'),
    category_id: z.string().min(1).describe('Category id'),
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .describe('Expense date (YYYY-MM-DD)'),
    description: z.string().min(1).optional().describe('Optional description'),
    currency: z.string().min(1).optional().describe('Optional currency code'),
    format: ResponseFormatSchema,
  })
  .strict();

const UpdateExpenseInputSchema = z
  .object({
    id: z.string().min(1).describe('The expense id'),
    amount: z.number().positive().optional(),
    category_id: z.string().min(1).optional(),
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    description: z.string().nullable().optional(),
    currency: z.string().nullable().optional(),
    format: ResponseFormatSchema,
  })
  .strict();

const DeleteExpenseInputSchema = z
  .object({
    id: z.string().min(1).describe('The expense id to delete'),
    format: ResponseFormatSchema,
  })
  .strict();

const SetBudgetInputSchema = z
  .object({
    month: z
      .string()
      .regex(/^\d{4}-\d{2}$/)
      .describe('Budget month (YYYY-MM)'),
    amount: z.number().positive().describe('Budget amount'),
    category_id: z.string().min(1).optional().describe('Category id (default: overall budget)'),
    format: ResponseFormatSchema,
  })
  .strict();

const CreateCategoryInputSchema = z
  .object({
    name: z.string().trim().min(1).max(50).describe('Category name'),
    color_hex: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .describe('Category color as #RRGGBB'),
    format: ResponseFormatSchema,
  })
  .strict();

type CreateExpenseInput = z.infer<typeof CreateExpenseInputSchema>;
type UpdateExpenseInput = z.infer<typeof UpdateExpenseInputSchema>;
type DeleteExpenseInput = z.infer<typeof DeleteExpenseInputSchema>;
type SetBudgetInput = z.infer<typeof SetBudgetInputSchema>;
type CreateCategoryInput = z.infer<typeof CreateCategoryInputSchema>;

export async function createExpenseHandler(
  params: CreateExpenseInput,
  ctx: McpUserContext
): Promise<ToolResult> {
  try {
    requireAnyScope(ctx, ['spendtrack.write']);
    const userId = requireUserId(ctx, 'Creating an expense');
    const repo = createSpendtrackRepository(ctx.supabase as never);

    const id = await repo.createExpense({
      user_id: userId,
      amount: params.amount,
      category_id: params.category_id,
      date: params.date,
      description: params.description ?? null,
      currency: params.currency ?? null,
    });

    const output = { id, message: 'Expense created.' };
    return params.format === 'json'
      ? structuredResponse(jsonText(output), output)
      : structuredResponse(
          `# Expense Created\n\n${formatAmount(params.amount, params.currency ?? null)} on ${params.date} (\`${id}\`)`,
          output
        );
  } catch (error) {
    return toolErrorResponse(error);
  }
}

export async function updateExpenseHandler(
  params: UpdateExpenseInput,
  ctx: McpUserContext
): Promise<ToolResult> {
  try {
    requireAnyScope(ctx, ['spendtrack.write']);
    const userId = requireUserId(ctx, 'Updating an expense');
    const repo = createSpendtrackRepository(ctx.supabase as never);

    await repo.updateExpense(params.id, userId, {
      amount: params.amount ?? 0,
      category_id: params.category_id ?? '',
      date: params.date ?? '',
      description: params.description ?? null,
      currency: params.currency ?? null,
    });

    const output = { id: params.id, message: 'Expense updated.' };
    return params.format === 'json'
      ? structuredResponse(jsonText(output), output)
      : structuredResponse(`# Expense Updated\n\nExpense \`${params.id}\` was updated.`, output);
  } catch (error) {
    return toolErrorResponse(error);
  }
}

export async function deleteExpenseHandler(
  params: DeleteExpenseInput,
  ctx: McpUserContext
): Promise<ToolResult> {
  try {
    requireAnyScope(ctx, ['spendtrack.write']);
    const userId = requireUserId(ctx, 'Deleting an expense');
    const repo = createSpendtrackRepository(ctx.supabase as never);

    await repo.deleteExpense(params.id, userId);
    const output = { id: params.id, message: 'Expense deleted.' };

    return params.format === 'json'
      ? structuredResponse(jsonText(output), output)
      : structuredResponse(`# Expense Deleted\n\nExpense \`${params.id}\` was deleted.`, output);
  } catch (error) {
    return toolErrorResponse(error);
  }
}

export async function setBudgetHandler(
  params: SetBudgetInput,
  ctx: McpUserContext
): Promise<ToolResult> {
  try {
    requireAnyScope(ctx, ['spendtrack.write']);
    const userId = requireUserId(ctx, 'Setting a budget');
    const repo = createSpendtrackRepository(ctx.supabase as never);

    await repo.setBudget(userId, params.month, params.amount, params.category_id ?? null);
    const output = {
      month: params.month,
      category_id: params.category_id ?? null,
      amount: params.amount,
      message: 'Budget saved.',
    };

    return params.format === 'json'
      ? structuredResponse(jsonText(output), output)
      : structuredResponse(
          `# Budget Saved\n\n${formatAmount(params.amount, null)} for ${params.month}${
            params.category_id ? ` (category \`${params.category_id}\`)` : ' (overall)'
          }.`,
          output
        );
  } catch (error) {
    return toolErrorResponse(error);
  }
}

export async function createCategoryHandler(
  params: CreateCategoryInput,
  ctx: McpUserContext
): Promise<ToolResult> {
  try {
    requireAnyScope(ctx, ['spendtrack.write']);
    const userId = requireUserId(ctx, 'Creating a category');
    const repo = createSpendtrackRepository(ctx.supabase as never);

    await repo.createCategory({ user_id: userId, name: params.name, colorHex: params.color_hex });
    const output = { name: params.name, colorHex: params.color_hex, message: 'Category created.' };

    return params.format === 'json'
      ? structuredResponse(jsonText(output), output)
      : structuredResponse(
          `# Category Created\n\n**${params.name}** (${params.color_hex})`,
          output
        );
  } catch (error) {
    return toolErrorResponse(error);
  }
}

export function registerSpendTrackWriteTools(server: McpServer, ctx: McpUserContext): void {
  server.registerTool(
    `${MCP_SERVER_NAME}_spendtrack_create_expense`,
    {
      title: 'Create Expense',
      description: `Records an expense. Requires "spendtrack.write" and an authenticated session.

Args:
  - amount (number, required): the amount
  - category_id (string, required): category id (see spendtrack_list_categories)
  - date (string, required): date YYYY-MM-DD
  - description (string, optional): short description
  - currency (string, optional): currency code
  - format ('markdown' | 'json', default 'markdown'): output format

Returns (JSON): { "id": string, "message": string }

Examples:
  - Use when: "record a 25.50 expense in category cat1 today" -> amount=25.5, category_id="cat1", date="2026-08-19"`,
      inputSchema: CreateExpenseInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    (params) => createExpenseHandler(params, ctx)
  );

  server.registerTool(
    `${MCP_SERVER_NAME}_spendtrack_update_expense`,
    {
      title: 'Update Expense',
      description: `Updates one of your expenses. Requires "spendtrack.write" and an authenticated session.

Args:
  - id (string, required): the expense id
  - amount (number, optional)
  - category_id (string, optional)
  - date (string, optional, YYYY-MM-DD)
  - description (string|null, optional)
  - currency (string|null, optional)
  - format ('markdown' | 'json', default 'markdown'): output format

Returns (JSON): { "id": string, "message": string }

Examples:
  - Use when: "change the amount of expense e1 to 40" -> id="e1", amount=40`,
      inputSchema: UpdateExpenseInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    (params) => updateExpenseHandler(params, ctx)
  );

  server.registerTool(
    `${MCP_SERVER_NAME}_spendtrack_delete_expense`,
    {
      title: 'Delete Expense',
      description: `Deletes one of your expenses. Requires "spendtrack.write" and an authenticated session.

Args:
  - id (string, required): the expense id
  - format ('markdown' | 'json', default 'markdown'): output format

Returns (JSON): { "id": string, "message": string }

Examples:
  - Use when: "delete expense e1" -> id="e1"`,
      inputSchema: DeleteExpenseInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    (params) => deleteExpenseHandler(params, ctx)
  );

  server.registerTool(
    `${MCP_SERVER_NAME}_spendtrack_set_budget`,
    {
      title: 'Set Budget',
      description: `Creates or updates a monthly budget (overall or per-category). Requires "spendtrack.write" and an authenticated session.

Args:
  - month (string, required): YYYY-MM
  - amount (number, required): budget amount
  - category_id (string, optional): restrict to a category
  - format ('markdown' | 'json', default 'markdown'): output format

Returns (JSON): { "month": string, "category_id": string|null, "amount": number, "message": string }

Examples:
  - Use when: "set my budget for August 2026 to 2000" -> month="2026-08", amount=2000`,
      inputSchema: SetBudgetInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    (params) => setBudgetHandler(params, ctx)
  );

  server.registerTool(
    `${MCP_SERVER_NAME}_spendtrack_create_category`,
    {
      title: 'Create Category',
      description: `Creates a custom spending category. Requires "spendtrack.write" and an authenticated session.

Args:
  - name (string, required): category name (max 50)
  - color_hex (string, required): color as #RRGGBB
  - format ('markdown' | 'json', default 'markdown'): output format

Returns (JSON): { "name": string, "colorHex": string, "message": string }

Examples:
  - Use when: "create a category called Travel" -> name="Travel", color_hex="#ff8800"`,
      inputSchema: CreateCategoryInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    (params) => createCategoryHandler(params, ctx)
  );
}

export type {
  ListTransactionsInput,
  GetSummaryInput,
  ListCategoriesInput,
  ListBudgetsInput,
  CreateExpenseInput,
  UpdateExpenseInput,
  DeleteExpenseInput,
  SetBudgetInput,
  CreateCategoryInput,
};
