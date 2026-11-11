import { z } from 'zod';

/**
 * The marketplace's outbound half: the apps نور reaches, and what one
 * connection may do (ADR-0155, phase 3 / #1224).
 *
 * The inbound half — the clients that reach us — keeps its own contract in
 * `mcp-connected-apps.ts`, because a grant and a connection are different
 * records with different addresses. They meet on one screen and only there.
 *
 * `permissionLevel` is the member's own widening (ADR-0155, decision 6): `ask`
 * cards every write, `reads` lets a tool that declares `readOnlyHint` run and
 * still cards the rest, and `all` follows the member's explicit choice for that
 * app. It is a level the member set, never one inferred from a description.
 */

/** The three levels a connection can hold, in order of widening. */
export const MCP_PERMISSION_LEVELS = ['ask', 'reads', 'all'] as const;

export const McpPermissionLevelSchema = z.enum(MCP_PERMISSION_LEVELS);

export type McpPermissionLevel = z.infer<typeof McpPermissionLevelSchema>;

/**
 * A connection's state as the server keeps it. `revoked` never reaches a
 * screen: a revoked row is deleted, so the list only carries the first three.
 */
export const McpConnectionStatusSchema = z.enum(['active', 'needs_reauth', 'error', 'revoked']);

export type McpConnectionStatus = z.infer<typeof McpConnectionStatusSchema>;

/**
 * One connection, as a list row draws it.
 *
 * `displayName` is the name the member reads — the server's own name, or the
 * one they renamed it to. `registryName` is the stable identity the catalogue
 * and the audit row address, and is not for display.
 */
export const McpConnectionSchema = z.object({
  id: z.string().min(1),
  registryName: z.string().min(1),
  displayName: z.string().nullable(),
  enabled: z.boolean(),
  permissionLevel: McpPermissionLevelSchema,
  status: McpConnectionStatusSchema,
  toolCount: z.number().int().nonnegative(),
  connectedAt: z.string(),
  lastUsedAt: z.string().nullable(),
  /** The server's own words about the last failure, or `null` when it is well. */
  lastError: z.string().nullable(),
});

export type McpConnection = z.infer<typeof McpConnectionSchema>;

/**
 * One tool the connection advertises, with its switch.
 *
 * `stale` means the server stopped advertising it since the last `tools/list`:
 * the row stays (the member's switch must survive a server's bad day) and the
 * screen says the list changed since connect.
 */
export const McpConnectionToolSchema = z.object({
  name: z.string().min(1),
  description: z.string().nullable(),
  /** `annotations.readOnlyHint`, and false when the server says nothing. */
  readOnly: z.boolean(),
  enabled: z.boolean(),
  stale: z.boolean(),
});

export type McpConnectionTool = z.infer<typeof McpConnectionToolSchema>;

/**
 * The post-connect screen: the connection and every tool it advertised.
 *
 * `scopes` is the grant the provider's token response named, as it named it —
 * the one fact that says what the connection may actually do. It is empty for a
 * row whose tokens predate the record, and a provider that publishes no scopes
 * is not the same as one that published none: the screen says which.
 */
export const McpConnectionDetailSchema = McpConnectionSchema.extend({
  scopes: z.array(z.string()),
  tools: z.array(McpConnectionToolSchema),
});

export type McpConnectionDetail = z.infer<typeof McpConnectionDetailSchema>;

export const McpConnectionListResultSchema = z.object({
  success: z.boolean(),
  data: z.array(McpConnectionSchema).optional(),
  error: z.string().optional(),
});

export type McpConnectionListResult = z.infer<typeof McpConnectionListResultSchema>;

export const McpConnectionDetailResultSchema = z.object({
  success: z.boolean(),
  data: McpConnectionDetailSchema.optional(),
  error: z.string().optional(),
});

export type McpConnectionDetailResult = z.infer<typeof McpConnectionDetailResultSchema>;

/** A disconnect answers only whether it happened, and why not if it did not. */
export const McpConnectionActionResultSchema = z.object({
  success: z.boolean(),
  error: z.string().optional(),
});

export type McpConnectionActionResult = z.infer<typeof McpConnectionActionResultSchema>;

/**
 * The three edits a member may make on a connection: turn it off without
 * revoking it, move its permission level, or rename it.
 *
 * At least one field is required: an empty body is a bug in the caller, not a
 * no-op the server should pretend to accept.
 */
export const McpConnectionUpdateSchema = z
  .object({
    enabled: z.boolean().optional(),
    permissionLevel: McpPermissionLevelSchema.optional(),
    displayName: z.string().trim().min(1).max(120).nullable().optional(),
  })
  .refine(
    (body) =>
      body.enabled !== undefined ||
      body.permissionLevel !== undefined ||
      body.displayName !== undefined,
    { message: 'لا يوجد تغيير' }
  );

export type McpConnectionUpdate = z.infer<typeof McpConnectionUpdateSchema>;

/** One tool's switch, addressed by the name the server gave it. */
export const McpConnectionToolUpdateSchema = z.object({
  toolName: z.string().trim().min(1).max(200),
  enabled: z.boolean(),
});

export type McpConnectionToolUpdate = z.infer<typeof McpConnectionToolUpdateSchema>;

/**
 * The three tabs of the apps surface, carried in `?tab=` on the page so a tab
 * is a shareable state and the back button still works.
 *
 * `internal` is the apps we ship (the picker's own rows), `external` is what
 * نور reaches through the marketplace, and `inbound` is what reaches the
 * member through our MCP server. `external` is the page's default, which is
 * what `/mcp/apps` has always meant; `apps` stays accepted as its old spelling.
 */
export const APPS_TABS = ['internal', 'external', 'inbound'] as const;

export type AppsTab = (typeof APPS_TABS)[number];

export function appsTab(value: string | null | undefined): AppsTab {
  if (value === 'internal' || value === 'inbound') return value;
  return 'external';
}
