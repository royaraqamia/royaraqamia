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

// ============================================================
// Write tools (habitflow.write)
// ============================================================

const CreateHabitInputSchema = z
  .object({
    name: z.string().trim().min(1).max(80).describe('Habit name'),
    icon: z.string().min(1).max(40).optional().describe('Icon name (default: Activity)'),
    frequency: z.enum(['daily', 'weekly']).optional().describe('Frequency (default: daily)'),
    target: z.number().int().positive().optional().describe('Weekly/monthly target count'),
    target_period: z.enum(['week', 'month']).optional().describe('Target period'),
    reminder_time: z
      .string()
      .regex(/^([01]\d|2[0-3]):([0-5]\d)$/)
      .optional()
      .describe('Reminder time HH:mm'),
    format: ResponseFormatSchema,
  })
  .strict();

const UpdateHabitInputSchema = z
  .object({
    id: z.string().min(1).describe('The habit id'),
    name: z.string().trim().min(1).max(80).optional(),
    icon: z.string().min(1).max(40).optional(),
    frequency: z.enum(['daily', 'weekly']).optional(),
    target: z.number().int().positive().nullable().optional(),
    target_period: z.enum(['week', 'month']).nullable().optional(),
    reminder_time: z
      .string()
      .regex(/^([01]\d|2[0-3]):([0-5]\d)$/)
      .nullable()
      .optional(),
    archived: z.boolean().optional(),
    format: ResponseFormatSchema,
  })
  .strict();

const DeleteHabitInputSchema = z
  .object({
    id: z.string().min(1).describe('The habit id to archive/delete'),
    format: ResponseFormatSchema,
  })
  .strict();

const ToggleLogInputSchema = z
  .object({
    habit_id: z.string().min(1).describe('The habit id'),
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .describe('Log date (YYYY-MM-DD)'),
    completed: z.boolean().describe('True to complete, false to uncomplete'),
    format: ResponseFormatSchema,
  })
  .strict();

type CreateHabitInput = z.infer<typeof CreateHabitInputSchema>;
type UpdateHabitInput = z.infer<typeof UpdateHabitInputSchema>;
type DeleteHabitInput = z.infer<typeof DeleteHabitInputSchema>;
type ToggleLogInput = z.infer<typeof ToggleLogInputSchema>;

export async function createHabitHandler(
  params: CreateHabitInput,
  ctx: McpUserContext
): Promise<ToolResult> {
  try {
    requireAnyScope(ctx, ['habitflow.write']);
    const userId = requireUserId(ctx, 'Creating a habit');
    const repo = new SupabaseHabitRepository(ctx.supabase as never, userId);
    const habit = await repo.createHabit({
      name: params.name,
      icon: params.icon ?? 'Activity',
      frequency: params.frequency ?? 'daily',
      target: params.target ?? null,
      targetPeriod: params.target_period ?? null,
      reminderTime: params.reminder_time ?? null,
    });

    const output = {
      id: habit.id,
      name: habit.name,
      icon: habit.icon,
      frequency: habit.frequency,
      target: habit.target ?? null,
      targetPeriod: habit.targetPeriod ?? null,
    };

    return params.format === 'json'
      ? structuredResponse(jsonText(output), output)
      : structuredResponse(`# Habit Created\n\n**${habit.name}** (\`${habit.id}\`)`, output);
  } catch (error) {
    return toolErrorResponse(error);
  }
}

export async function updateHabitHandler(
  params: UpdateHabitInput,
  ctx: McpUserContext
): Promise<ToolResult> {
  try {
    requireAnyScope(ctx, ['habitflow.write']);
    const userId = requireUserId(ctx, 'Updating a habit');
    const repo = new SupabaseHabitRepository(ctx.supabase as never, userId);
    const habit = await repo.updateHabit(params.id, {
      name: params.name,
      icon: params.icon,
      frequency: params.frequency,
      target: params.target,
      targetPeriod: params.target_period,
      reminderTime: params.reminder_time,
      archived: params.archived,
    });

    const output = {
      id: habit.id,
      name: habit.name,
      archived: habit.archived,
      message: 'Habit updated.',
    };

    return params.format === 'json'
      ? structuredResponse(jsonText(output), output)
      : structuredResponse(`# Habit Updated\n\n**${habit.name}** (\`${habit.id}\`)`, output);
  } catch (error) {
    return toolErrorResponse(error);
  }
}

export async function deleteHabitHandler(
  params: DeleteHabitInput,
  ctx: McpUserContext
): Promise<ToolResult> {
  try {
    requireAnyScope(ctx, ['habitflow.write']);
    const userId = requireUserId(ctx, 'Deleting a habit');
    const repo = new SupabaseHabitRepository(ctx.supabase as never, userId);
    const deleted = await repo.deleteHabit(params.id);

    if (!deleted) {
      return {
        isError: true,
        content: [{ type: 'text', text: 'Habit not found or could not be archived.' }],
      };
    }

    const output = { id: params.id, message: 'Habit archived.' };
    return params.format === 'json'
      ? structuredResponse(jsonText(output), output)
      : structuredResponse(`# Habit Deleted\n\nHabit \`${params.id}\` was archived.`, output);
  } catch (error) {
    return toolErrorResponse(error);
  }
}

export async function toggleLogHandler(
  params: ToggleLogInput,
  ctx: McpUserContext
): Promise<ToolResult> {
  try {
    requireAnyScope(ctx, ['habitflow.write']);
    const userId = requireUserId(ctx, 'Toggling a habit log');
    const repo = new SupabaseHabitRepository(ctx.supabase as never, userId);
    const log = await repo.toggleLog(params.habit_id, params.date, params.completed);

    const output = {
      id: log.id,
      habitId: log.habitId,
      date: log.date,
      completed: log.completed,
      message: params.completed ? 'Habit marked complete.' : 'Habit marked incomplete.',
    };

    return params.format === 'json'
      ? structuredResponse(jsonText(output), output)
      : structuredResponse(
          `# Habit Log ${params.completed ? 'Completed' : 'Uncompleted'}\n\nHabit \`${params.habit_id}\` on ${params.date}.`,
          output
        );
  } catch (error) {
    return toolErrorResponse(error);
  }
}

export function registerHabitFlowWriteTools(server: McpServer, ctx: McpUserContext): void {
  server.registerTool(
    `${MCP_SERVER_NAME}_habitflow_create_habit`,
    {
      title: 'Create Habit',
      description: `Creates a new habit. Requires "habitflow.write" and an authenticated session.

Args:
  - name (string, required): habit name
  - icon (string, optional): icon name (default: Activity)
  - frequency ('daily' | 'weekly', optional)
  - target (number, optional): target count for the target period
  - target_period ('week' | 'month', optional)
  - reminder_time (string, optional): HH:mm
  - format ('markdown' | 'json', default 'markdown'): output format

Returns (JSON): { "id": string, "name": string, "icon": string, "frequency": string, "target": number|null, "targetPeriod": string|null }

Examples:
  - Use when: "create a habit called Reading" -> name="Reading"
  - Use when: "create daily habit Meditate with 8pm reminder" -> name="Meditate", reminder_time="20:00"`,
      inputSchema: CreateHabitInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    (params) => createHabitHandler(params, ctx)
  );

  server.registerTool(
    `${MCP_SERVER_NAME}_habitflow_update_habit`,
    {
      title: 'Update Habit',
      description: `Updates one of your habits. Requires "habitflow.write" and an authenticated session.

Args:
  - id (string, required): the habit id
  - name (string, optional)
  - icon (string, optional)
  - frequency ('daily' | 'weekly', optional)
  - target (number|null, optional)
  - target_period ('week' | 'month'|null, optional)
  - reminder_time (string|null, optional, HH:mm)
  - archived (boolean, optional)
  - format ('markdown' | 'json', default 'markdown'): output format

Returns (JSON): { "id": string, "name": string, "archived": boolean, "message": string }

Examples:
  - Use when: "rename habit h1 to Reading books" -> id="h1", name="Reading books"`,
      inputSchema: UpdateHabitInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    (params) => updateHabitHandler(params, ctx)
  );

  server.registerTool(
    `${MCP_SERVER_NAME}_habitflow_delete_habit`,
    {
      title: 'Delete Habit',
      description: `Archives (soft-deletes) one of your habits. Requires "habitflow.write" and an authenticated session.

Args:
  - id (string, required): the habit id
  - format ('markdown' | 'json', default 'markdown'): output format

Returns (JSON): { "id": string, "message": string }

Examples:
  - Use when: "delete habit h1" -> id="h1"`,
      inputSchema: DeleteHabitInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    (params) => deleteHabitHandler(params, ctx)
  );

  server.registerTool(
    `${MCP_SERVER_NAME}_habitflow_toggle_log`,
    {
      title: 'Toggle Habit Log',
      description: `Marks a habit complete or incomplete for a given date. Requires "habitflow.write" and an authenticated session.

Args:
  - habit_id (string, required): the habit id
  - date (string, required): date YYYY-MM-DD
  - completed (boolean, required): true to complete, false to uncomplete
  - format ('markdown' | 'json', default 'markdown'): output format

Returns (JSON): { "id": string, "habitId": string, "date": string, "completed": boolean, "message": string }

Examples:
  - Use when: "mark habit h1 complete today" -> habit_id="h1", date="2026-08-19", completed=true`,
      inputSchema: ToggleLogInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    (params) => toggleLogHandler(params, ctx)
  );
}

export type {
  ListHabitsInput,
  GetLogsInput,
  CreateHabitInput,
  UpdateHabitInput,
  DeleteHabitInput,
  ToggleLogInput,
};
