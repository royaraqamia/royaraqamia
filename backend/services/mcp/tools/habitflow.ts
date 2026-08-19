import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpUserContext } from '../session';
import { MCP_SERVER_NAME } from '../constants';
import { jsonText, structuredResponse, toolErrorResponse, type ToolResult } from './tool-utils';
import { requireAnyScope, requireUserId } from './guards';
import { SupabaseHabitRepository } from '@/backend/repositories/habitflow/supabase-repository';
import {
  buildPaginationMeta,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  ResponseFormatSchema,
} from './shared';

/**
 * HabitFlow read tools. The repository is constructed with the user-scoped
 * client and the caller's user id, so habits/logs are always scoped to the
 * caller (habits/habit_logs RLS is user_id = auth.uid()).
 */

const ListHabitsInputSchema = z
  .object({
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

const GetLogsInputSchema = z
  .object({
    start: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .describe('Inclusive start date (YYYY-MM-DD)'),
    end: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .describe('Inclusive end date (YYYY-MM-DD)'),
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

type ListHabitsInput = z.infer<typeof ListHabitsInputSchema>;
type GetLogsInput = z.infer<typeof GetLogsInputSchema>;

export async function listHabitsHandler(
  params: ListHabitsInput,
  ctx: McpUserContext
): Promise<ToolResult> {
  try {
    requireAnyScope(ctx, ['habitflow.read']);
    const userId = requireUserId(ctx, 'Listing habits');
    const repo = new SupabaseHabitRepository(ctx.supabase as never, userId);
    const habits = await repo.getHabits();

    const start = params.offset;
    const page = habits.slice(start, start + params.page_size);
    const items = page.map((h) => ({
      id: h.id,
      name: h.name,
      icon: h.icon,
      frequency: h.frequency,
      target: h.target ?? null,
      targetPeriod: h.targetPeriod ?? null,
      reminderTime: h.reminderTime ?? null,
    }));
    const meta = buildPaginationMeta(habits.length, page.length, params.offset);

    if (params.format === 'json') {
      return structuredResponse(jsonText({ habits: items, ...meta }), { habits: items, ...meta });
    }

    const lines = [
      '# Your Habits',
      '',
      `Found ${meta.total} active habit${meta.total === 1 ? '' : 's'}.`,
      '',
    ];
    for (const h of items) {
      lines.push(`- **${h.name}** (${h.frequency}) — \`${h.id}\``);
    }
    if (meta.has_more) {
      lines.push('', `(Showing ${meta.count} of ${meta.total}; use offset to continue.)`);
    }
    return structuredResponse(lines.join('\n'), { habits: items, ...meta });
  } catch (error) {
    return toolErrorResponse(error);
  }
}

export async function getLogsHandler(
  params: GetLogsInput,
  ctx: McpUserContext
): Promise<ToolResult> {
  try {
    requireAnyScope(ctx, ['habitflow.read']);
    const userId = requireUserId(ctx, 'Getting habit logs');
    const repo = new SupabaseHabitRepository(ctx.supabase as never, userId);
    const logs = await repo.getLogs(params.start, params.end);

    const start = params.offset;
    const page = logs.slice(start, start + params.page_size);
    const items = page.map((l) => ({
      id: l.id,
      habitId: l.habitId,
      date: l.date,
      completed: l.completed,
      kind: l.kind ?? null,
      note: l.note ?? null,
    }));
    const meta = buildPaginationMeta(logs.length, page.length, params.offset);

    if (params.format === 'json') {
      return structuredResponse(jsonText({ logs: items, ...meta }), { logs: items, ...meta });
    }

    const lines = [
      `# Habit Logs (${params.start} → ${params.end})`,
      '',
      `Found ${meta.total} log${meta.total === 1 ? '' : 's'}.`,
      '',
    ];
    for (const l of items) {
      lines.push(
        `- ${l.completed ? '[x]' : '[ ]'} ${l.date} — \`${l.habitId}\`${
          l.kind ? ` (${l.kind})` : ''
        }${l.note ? ` — ${l.note}` : ''}`
      );
    }
    if (meta.has_more) {
      lines.push('', `(Showing ${meta.count} of ${meta.total}; use offset to continue.)`);
    }
    return structuredResponse(lines.join('\n'), { logs: items, ...meta });
  } catch (error) {
    return toolErrorResponse(error);
  }
}

export function registerHabitFlowTools(server: McpServer, ctx: McpUserContext): void {
  server.registerTool(
    `${MCP_SERVER_NAME}_habitflow_list_habits`,
    {
      title: 'List Habits',
      description: `Lists your active habits. Requires "habitflow.read" and an authenticated session.

Args:
  - page_size (number, default 20, max 100): results per page
  - offset (number, default 0): 0-based pagination offset
  - format ('markdown' | 'json', default 'markdown'): output format

Returns (JSON): { "habits": {id,name,icon,frequency,target,targetPeriod,reminderTime}[], "total": number, "count": number, "offset": number, "has_more": boolean }

Examples:
  - Use when: "what are my habits"`,
      inputSchema: ListHabitsInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    (params) => listHabitsHandler(params, ctx)
  );

  server.registerTool(
    `${MCP_SERVER_NAME}_habitflow_get_logs`,
    {
      title: 'Get Habit Logs',
      description: `Returns your habit completion logs in a date range. Requires "habitflow.read" and an authenticated session.

Args:
  - start (string, required): inclusive start date YYYY-MM-DD
  - end (string, required): inclusive end date YYYY-MM-DD
  - page_size (number, default 20, max 100): results per page
  - offset (number, default 0): 0-based pagination offset
  - format ('markdown' | 'json', default 'markdown'): output format

Returns (JSON): { "logs": {id,habitId,date,completed,kind,note}[], "total": number, "count": number, "offset": number, "has_more": boolean }

Examples:
  - Use when: "what did I complete this week" -> start="2026-08-17", end="2026-08-23"`,
      inputSchema: GetLogsInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    (params) => getLogsHandler(params, ctx)
  );
}

export type { ListHabitsInput, GetLogsInput };
