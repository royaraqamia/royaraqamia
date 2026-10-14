/**
 * The account area's view of an MCP grant — one connected MCP client.
 *
 * Deliberately not the token row: a grant has no id of its own (it is the set of
 * live tokens one client holds for one user), so `clientId` is what a disconnect
 * addresses and nothing about the tokens crosses this boundary.
 */
export interface McpConnection {
  /**
   * The connected client as the grant's token rows carry it: the registration's
   * own row id, *not* the `client_id` text the client registered with. It is
   * also what a disconnect addresses.
   */
  clientId: string;
  clientName: string | null;
  /** When the client first connected (earliest live token row). */
  connectedAt: string;
  /** Last time the client used the grant, or `null` when it never has. */
  lastUsedAt: string | null;
}

export interface McpConnectionListResult {
  success: boolean;
  data?: McpConnection[];
  error?: string;
}

export interface McpConnectionActionResult {
  success: boolean;
  error?: string;
}
