import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpUserContext } from '../session';
import { MCP_SERVER_NAME } from '../constants';
import { jsonText, structuredResponse, toolErrorResponse, type ToolResult } from './tool-utils';
import { requireAnyScope, requireUserId } from './guards';
import { SupabaseShortLinkRepository } from '@/backend/repositories/linksnap/supabase-short-link';
import { SupabaseAnalyticsRepository } from '@/backend/repositories/linksnap/supabase-analytics';
import type { ShortLink } from '@/shared/contracts/linksnap';
import {
  buildPaginationMeta,
  formatDate,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  ResponseFormatSchema,
} from './shared';

/**
 * LinkSnap read tools. The analytics repository already scopes events to the
 * caller via the `analytics_select` RLS policy (EXISTS a short_links row owned
 * by auth.uid()), and the short-link list is filtered by user_id — both on the
 * user-scoped client, so cross-tenant reads are impossible.
 */

const ListLinksInputSchema = z
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

const GetAnalyticsInputSchema = z
  .object({
    code: z.string().min(1).describe('The short link code (slug) to get analytics for'),
    days: z
      .number()
      .int()
      .min(1)
      .max(366)
      .optional()
      .describe('Number of days to look back (default: all time)'),
    format: ResponseFormatSchema,
  })
  .strict();

type ListLinksInput = z.infer<typeof ListLinksInputSchema>;
type GetAnalyticsInput = z.infer<typeof GetAnalyticsInputSchema>;

function serializeLink(link: ShortLink) {
  return {
    code: link.code,
    originalUrl: link.originalUrl,
    createdAt: formatDate(link.createdAt),
    updatedAt: formatDate(link.updatedAt),
    isBlocked: link.isBlocked,
    expiresAt: formatDate(link.expiresAt),
    hasPassword: link.passwordHash !== null,
  };
}

export async function listLinksHandler(
  params: ListLinksInput,
  ctx: McpUserContext
): Promise<ToolResult> {
  try {
    requireAnyScope(ctx, ['linksnap.read']);
    const userId = requireUserId(ctx, 'Listing short links');
    const repo = new SupabaseShortLinkRepository(ctx.supabase as never, ctx.supabase as never);
    const links = await repo.listByUserId(userId);

    const start = params.offset;
    const page = links.slice(start, start + params.page_size);
    const items = page.map(serializeLink);
    const meta = buildPaginationMeta(links.length, page.length, params.offset);

    if (params.format === 'json') {
      return structuredResponse(jsonText({ links: items, ...meta }), { links: items, ...meta });
    }

    const lines = [
      `# Your Short Links`,
      '',
      `Found ${meta.total} link${meta.total === 1 ? '' : 's'}.`,
      '',
    ];
    for (const l of items) {
      lines.push(
        `- **${l.code}** → ${l.originalUrl}${l.isBlocked ? ' (blocked)' : ''}${
          l.expiresAt !== '—' ? `, expires ${l.expiresAt}` : ''
        }`
      );
    }
    if (meta.has_more) {
      lines.push('', `(Showing ${meta.count} of ${meta.total}; use offset to continue.)`);
    }
    return structuredResponse(lines.join('\n'), { links: items, ...meta });
  } catch (error) {
    return toolErrorResponse(error);
  }
}

export async function getAnalyticsHandler(
  params: GetAnalyticsInput,
  ctx: McpUserContext
): Promise<ToolResult> {
  try {
    requireAnyScope(ctx, ['linksnap.read']);
    requireUserId(ctx, 'Getting link analytics');

    const analyticsRepo = new SupabaseAnalyticsRepository(ctx.supabase as never);
    const owner = await analyticsRepo.getLinkOwner(params.code);
    if (!owner || owner !== ctx.userId) {
      return {
        isError: true,
        content: [{ type: 'text', text: `No short link with code "${params.code}" owned by you.` }],
      };
    }

    const range = params.days
      ? { from: new Date(Date.now() - params.days * 24 * 60 * 60 * 1000) }
      : undefined;
    const summary = await analyticsRepo.getSummaryForLink(params.code, range);

    const output = {
      code: params.code,
      totalClicks: summary.totalClicks,
      clicksByDate: summary.clicksByDate,
      topReferrers: summary.topReferrers,
      device: summary.device,
      recentClicks: summary.recentClicks.slice(0, 10).map((e) => ({
        id: e.id,
        clickedAt: formatDate(e.clickedAt),
        referrer: e.referrer,
        ipCountry: e.ipCountry,
      })),
    };

    if (params.format === 'json') {
      return structuredResponse(jsonText(output), output);
    }

    const lines = [
      `# Analytics for "${params.code}"`,
      '',
      `- **Total clicks**: ${summary.totalClicks}`,
      '',
      '**Device breakdown**',
      `- Devices: ${
        summary.device.devices.map((d) => `${d.name} ${d.count} (${d.percent}%)`).join(', ') || '—'
      }`,
      `- OS: ${summary.device.os.map((d) => `${d.name} ${d.count}`).join(', ') || '—'}`,
      `- Browsers: ${summary.device.browsers.map((d) => `${d.name} ${d.count}`).join(', ') || '—'}`,
      '',
      '**Top referrers**',
      ...summary.topReferrers.map((r) => `- ${r.name}: ${r.count}`),
      '',
      '**Recent clicks**',
      ...summary.recentClicks
        .slice(0, 5)
        .map((e) => `- ${formatDate(e.clickedAt)}${e.referrer ? ` via ${e.referrer}` : ''}`),
    ];
    return structuredResponse(lines.join('\n'), output);
  } catch (error) {
    return toolErrorResponse(error);
  }
}

export function registerLinkSnapTools(server: McpServer, ctx: McpUserContext): void {
  server.registerTool(
    `${MCP_SERVER_NAME}_linksnap_list_links`,
    {
      title: 'List Short Links',
      description: `Lists your short links. Requires the "linksnap.read" scope and an authenticated session. Only links owned by the caller are returned.

Args:
  - page_size (number, default 20, max 100): results per page
  - offset (number, default 0): 0-based pagination offset
  - format ('markdown' | 'json', default 'markdown'): output format

Returns (JSON): { "links": ShortLink[], "total": number, "count": number, "offset": number, "has_more": boolean }

Examples:
  - Use when: "list my short links"`,
      inputSchema: ListLinksInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    (params) => listLinksHandler(params, ctx)
  );

  server.registerTool(
    `${MCP_SERVER_NAME}_linksnap_get_analytics`,
    {
      title: 'Get Link Analytics',
      description: `Returns click analytics for one of your short links: total clicks, daily breakdown, top referrers, and device breakdown. Requires "linksnap.read" and an authenticated session. Only links owned by the caller can be queried.

Args:
  - code (string, required): the short link code/slug
  - days (number, optional, 1-366): look-back window in days (default: all time)
  - format ('markdown' | 'json', default 'markdown'): output format

Returns (JSON): { "code": string, "totalClicks": number, "clicksByDate": {date,clicks}[], "topReferrers": {name,count}[], "device": {...}, "recentClicks": [...] }

Examples:
  - Use when: "how many clicks did my link X get" -> code="x123"
  - Use when: "analytics for the last 30 days" -> code="x123", days=30`,
      inputSchema: GetAnalyticsInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    (params) => getAnalyticsHandler(params, ctx)
  );
}

export type { ListLinksInput, GetAnalyticsInput };
