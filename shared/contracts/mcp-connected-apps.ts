import { z } from 'zod';

/**
 * The account area's view of an MCP grant — one connected MCP client.
 *
 * Deliberately not the token row: a grant has no id of its own (it is the set of
 * live tokens one client holds for one user), so `clientId` is what a disconnect
 * addresses and nothing about the tokens crosses this boundary.
 *
 * The Zod schema is the wire shape, so the app's Kotlin contract is generated from
 * the same declaration the site reads (ADR-0098): a field renamed here is a compile
 * error in `McpConnectedAppsContracts.kt` rather than a `null` on a screen.
 */
export const McpConnectedAppPayloadSchema = z.object({
  /**
   * The connected client as the grant's token rows carry it: the registration's
   * own row id, *not* the `client_id` text the client registered with. It is
   * also what a disconnect addresses.
   */
  clientId: z.string().min(1),
  clientName: z.string().nullable(),
  /** When the client first connected (earliest live token row). */
  connectedAt: z.string(),
  /** Last time the client used the grant, or `null` when it never has. */
  lastUsedAt: z.string().nullable(),
});

export type McpConnectedApp = z.infer<typeof McpConnectedAppPayloadSchema>;

/**
 * A read answers the list, or says it could not: a security surface must not let
 * "nothing is connected" and "we could not tell you" look the same, which is why
 * the failure carries an `error` rather than an empty `data`.
 */
export const McpConnectedAppListResultSchema = z.object({
  success: z.boolean(),
  data: z.array(McpConnectedAppPayloadSchema).optional(),
  error: z.string().optional(),
});

export type McpConnectedAppListResult = z.infer<typeof McpConnectedAppListResultSchema>;

/** A disconnect answers only whether it happened, and why not if it did not. */
export const McpConnectedAppActionResultSchema = z.object({
  success: z.boolean(),
  error: z.string().optional(),
});

export type McpConnectedAppActionResult = z.infer<typeof McpConnectedAppActionResultSchema>;
