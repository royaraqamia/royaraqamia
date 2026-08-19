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

export type { ListTransactionsInput, GetSummaryInput, ListCategoriesInput, ListBudgetsInput };
