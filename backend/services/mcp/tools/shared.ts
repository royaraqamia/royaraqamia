import { z } from 'zod';

/**
 * Shared schema pieces for MCP tools. Mirrors the standalone admin MCP
 * workspace conventions (response_format, pagination, page sizes) so the two
 * servers feel consistent to clients.
 */

export const MAX_PAGE_SIZE = 100;
export const DEFAULT_PAGE_SIZE = 20;
export const CHARACTER_LIMIT = 25000;

export const ResponseFormatSchema = z
  .enum(['markdown', 'json'])
  .default('markdown')
  .describe("Output format: 'markdown' for human-readable or 'json' for machine-readable");

export const PAGE_SIZE_SCHEMA = z
  .number()
  .int()
  .min(1)
  .max(MAX_PAGE_SIZE)
  .default(DEFAULT_PAGE_SIZE)
  .describe(
    `Maximum results to return, between 1 and ${MAX_PAGE_SIZE} (default: ${DEFAULT_PAGE_SIZE})`
  );

export const OFFSET_SCHEMA = z
  .number()
  .int()
  .min(0)
  .default(0)
  .describe('0-based offset for pagination (default: 0)');

export interface PaginationMeta {
  total: number;
  count: number;
  offset: number;
  has_more: boolean;
  next_offset?: number;
}

export function buildPaginationMeta(total: number, count: number, offset: number): PaginationMeta {
  const hasMore = offset + count < total;
  return {
    total,
    count,
    offset,
    has_more: hasMore,
    ...(hasMore ? { next_offset: offset + count } : {}),
  };
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return '—';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toISOString();
}

export interface Truncated {
  text: string;
  truncated: boolean;
}

export function truncate(text: string, limit: number = CHARACTER_LIMIT): Truncated {
  if (text.length <= limit) {
    return { text, truncated: false };
  }
  const cut = text.slice(0, Math.max(1, Math.floor(limit * 0.9)));
  return {
    text: `${cut}\n\n[Response truncated at ${limit} characters. Use pagination or filters to narrow results.]`,
    truncated: true,
  };
}
