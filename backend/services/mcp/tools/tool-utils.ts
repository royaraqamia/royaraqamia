import { getErrorMessage } from '@/backend/shared/errors';

/**
 * Shared helpers for the royaraqamia MCP tools: standard ToolResult shapes,
 * markdown/json output formatting, and consistent error reporting.
 */

export enum ResponseFormat {
  MARKDOWN = 'markdown',
  JSON = 'json',
}

export type ToolResult = {
  content: Array<{ type: 'text'; text: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
};

export function markdownResponse(text: string): ToolResult {
  return { content: [{ type: 'text', text }] };
}

export function structuredResponse(
  text: string,
  structuredContent: Record<string, unknown>
): ToolResult {
  return { content: [{ type: 'text', text }], structuredContent };
}

export function jsonText(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

export function toolErrorResponse(error: unknown): ToolResult {
  return {
    isError: true,
    content: [{ type: 'text', text: `Error: ${getErrorMessage(error)}` }],
  };
}
