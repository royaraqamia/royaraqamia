import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { McpUserContext } from '../session';
import { MCP_SERVER_NAME } from '../constants';
import { jsonText, structuredResponse, toolErrorResponse, type ToolResult } from './tool-utils';
import { requireAnyScope, requireUserId } from './guards';
import { SupabaseShortLinkRepository } from '@/backend/repositories/linksnap/supabase-short-link';
import { SupabaseAnalyticsRepository } from '@/backend/repositories/linksnap/supabase-analytics';
import { ShortenUrlService } from '@/backend/services/linksnap/shorten-url';
import { UpdateLinkService } from '@/backend/services/linksnap/update-link';
import { DeleteLinkService } from '@/backend/services/linksnap/delete-link';
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

// ============================================================
// Write tools (linksnap.write)
// ============================================================

const CreateLinkInputSchema = z
  .object({
    url: z.string().min(1).describe('The original URL to shorten'),
    code: z.string().min(3).max(16).optional().describe('Custom short code (3-16 chars)'),
    expires_at: z.string().datetime().optional().describe('Expiry as ISO-8601 datetime'),
    password: z.string().min(1).optional().describe('Optional password to protect the link'),
    format: ResponseFormatSchema,
  })
  .strict();

const UpdateLinkInputSchema = z
  .object({
    code: z.string().min(1).describe('The current short code'),
    new_code: z.string().min(3).max(16).optional().describe('New short code (3-16 chars)'),
    url: z.string().min(1).optional().describe('New destination URL'),
    expires_at: z
      .string()
      .datetime()
      .nullable()
      .optional()
      .describe('New expiry (ISO-8601) or null to clear'),
    password: z.string().nullable().optional().describe('Set a new password, or null to clear it'),
    format: ResponseFormatSchema,
  })
  .strict();

const DeleteLinkInputSchema = z
  .object({
    code: z.string().min(1).describe('The short code to delete'),
    format: ResponseFormatSchema,
  })
  .strict();

type CreateLinkInput = z.infer<typeof CreateLinkInputSchema>;
type UpdateLinkInput = z.infer<typeof UpdateLinkInputSchema>;
type DeleteLinkInput = z.infer<typeof DeleteLinkInputSchema>;

export async function createLinkHandler(
  params: CreateLinkInput,
  ctx: McpUserContext
): Promise<ToolResult> {
  try {
    requireAnyScope(ctx, ['linksnap.write']);
    const userId = requireUserId(ctx, 'Creating a short link');
    const repo = new SupabaseShortLinkRepository(ctx.supabase as never, ctx.supabase as never);
    const service = new ShortenUrlService(repo);

    const link = await service.execute(
      params.url,
      userId,
      params.code,
      params.expires_at ? new Date(params.expires_at) : null,
      params.password
    );

    const output = {
      code: link.code,
      originalUrl: link.originalUrl,
      expiresAt: link.expiresAt ? formatDate(link.expiresAt) : null,
      hasPassword: link.passwordHash !== null,
    };

    return params.format === 'json'
      ? structuredResponse(jsonText(output), output)
      : structuredResponse(
          `# Short Link Created\n\n- **Code**: \`${link.code}\`\n- **URL**: ${link.originalUrl}\n- **Expires**: ${output.expiresAt ?? 'never'}\n- **Protected**: ${output.hasPassword ? 'yes' : 'no'}`,
          output
        );
  } catch (error) {
    return toolErrorResponse(error);
  }
}

export async function updateLinkHandler(
  params: UpdateLinkInput,
  ctx: McpUserContext
): Promise<ToolResult> {
  try {
    requireAnyScope(ctx, ['linksnap.write']);
    const userId = requireUserId(ctx, 'Updating a short link');
    const repo = new SupabaseShortLinkRepository(ctx.supabase as never, ctx.supabase as never);
    const service = new UpdateLinkService(repo);

    const link = await service.execute(params.code, userId, {
      code: params.new_code,
      originalUrl: params.url,
      expiresAt:
        params.expires_at === undefined
          ? undefined
          : params.expires_at
            ? new Date(params.expires_at)
            : null,
      password: params.password,
    });

    const output = {
      code: link.code,
      originalUrl: link.originalUrl,
      expiresAt: link.expiresAt ? formatDate(link.expiresAt) : null,
    };

    return params.format === 'json'
      ? structuredResponse(jsonText(output), output)
      : structuredResponse(
          `# Short Link Updated\n\n- **Code**: \`${link.code}\`\n- **URL**: ${link.originalUrl}\n- **Expires**: ${output.expiresAt ?? 'never'}`,
          output
        );
  } catch (error) {
    return toolErrorResponse(error);
  }
}

export async function deleteLinkHandler(
  params: DeleteLinkInput,
  ctx: McpUserContext
): Promise<ToolResult> {
  try {
    requireAnyScope(ctx, ['linksnap.write']);
    const userId = requireUserId(ctx, 'Deleting a short link');
    const repo = new SupabaseShortLinkRepository(ctx.supabase as never, ctx.supabase as never);
    const service = new DeleteLinkService(repo);

    await service.execute(params.code, userId);
    const output = { code: params.code, message: 'Short link deleted.' };

    return params.format === 'json'
      ? structuredResponse(jsonText(output), output)
      : structuredResponse(`# Short Link Deleted\n\nLink \`${params.code}\` was deleted.`, output);
  } catch (error) {
    return toolErrorResponse(error);
  }
}

export function registerLinkSnapWriteTools(server: McpServer, ctx: McpUserContext): void {
  server.registerTool(
    `${MCP_SERVER_NAME}_linksnap_create_link`,
    {
      title: 'Create Short Link',
      description: `Shortens a URL for you. Requires "linksnap.write" and an authenticated session.

Args:
  - url (string, required): the original URL (http/https)
  - code (string, optional): custom short code, 3-16 characters
  - expires_at (string, optional): ISO-8601 expiry datetime
  - password (string, optional): protect the link with a password
  - format ('markdown' | 'json', default 'markdown'): output format

Returns (JSON): { "code": string, "originalUrl": string, "expiresAt": string|null, "hasPassword": boolean }

Examples:
  - Use when: "shorten https://example.com" -> url="https://example.com"
  - Use when: "create link promo with code 'summer'" -> url="https://example.com/deal", code="summer"`,
      inputSchema: CreateLinkInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    (params) => createLinkHandler(params, ctx)
  );

  server.registerTool(
    `${MCP_SERVER_NAME}_linksnap_update_link`,
    {
      title: 'Update Short Link',
      description: `Updates the destination, code, expiry, or password of one of your short links. Requires "linksnap.write" and an authenticated session.

Args:
  - code (string, required): the current short code
  - new_code (string, optional): a new short code (3-16 chars)
  - url (string, optional): new destination URL
  - expires_at (string|null, optional): new expiry (ISO-8601) or null to clear
  - password (string|null, optional): new password or null to clear
  - format ('markdown' | 'json', default 'markdown'): output format

Returns (JSON): { "code": string, "originalUrl": string, "expiresAt": string|null }

Examples:
  - Use when: "change the destination of link abc to https://new.example.com" -> code="abc", url="https://new.example.com"`,
      inputSchema: UpdateLinkInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    (params) => updateLinkHandler(params, ctx)
  );

  server.registerTool(
    `${MCP_SERVER_NAME}_linksnap_delete_link`,
    {
      title: 'Delete Short Link',
      description: `Deletes one of your short links. Requires "linksnap.write" and an authenticated session.

Args:
  - code (string, required): the short code to delete
  - format ('markdown' | 'json', default 'markdown'): output format

Returns (JSON): { "code": string, "message": string }

Examples:
  - Use when: "delete my short link abc" -> code="abc"`,
      inputSchema: DeleteLinkInputSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    (params) => deleteLinkHandler(params, ctx)
  );
}

export type { CreateLinkInput, UpdateLinkInput, DeleteLinkInput };
