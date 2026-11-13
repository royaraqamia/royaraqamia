import { MCP_SERVER_NAME } from '@/backend/services/mcp/constants';
import type { Capability, CapabilityOwner } from '@/backend/services/tools/registry';

/**
 * The MCP server's half of the capability registry (ADR-0183).
 *
 * The modules in `backend/services/mcp/tools/` register from these rows: the name comes from
 * here rather than a literal repeated in seven files, and `mcp-capabilities.test.ts` fails the
 * moment the table and the server disagree. The scope stays with the handler, which is where it
 * is enforced; the table grows a scope column when a capability is written once for both doors.
 *
 * `owner` is the capability's product, not the module that happens to carry it:
 * `certificates.verify` is a certificate read whether it is called from the server or, one day,
 * from a turn.
 */

interface McpRow {
  owner: CapabilityOwner;
  /** The short name, without the server prefix. */
  name: string;
  kind: 'read' | 'write';
  tier: Capability['tier'];
}

const ROWS: McpRow[] = [
  // certificates
  { owner: 'certificates', name: 'list', kind: 'read', tier: 0 },
  { owner: 'certificates', name: 'list_mine', kind: 'read', tier: 0 },
  { owner: 'certificates', name: 'get', kind: 'read', tier: 0 },
  { owner: 'certificates', name: 'verify', kind: 'read', tier: 0 },
  { owner: 'certificates', name: 'create', kind: 'write', tier: 2 },
  { owner: 'certificates', name: 'update', kind: 'write', tier: 2 },
  { owner: 'certificates', name: 'delete', kind: 'write', tier: 3 },

  // community
  { owner: 'community', name: 'list_posts', kind: 'read', tier: 0 },
  { owner: 'community', name: 'get_post', kind: 'read', tier: 0 },
  { owner: 'community', name: 'create_post', kind: 'write', tier: 1 },
  { owner: 'community', name: 'update_post', kind: 'write', tier: 1 },
  { owner: 'community', name: 'publish_post', kind: 'write', tier: 2 },
  { owner: 'community', name: 'unpublish_post', kind: 'write', tier: 1 },
  { owner: 'community', name: 'delete_post', kind: 'write', tier: 3 },

  // habitflow
  { owner: 'habitflow', name: 'list_habits', kind: 'read', tier: 0 },
  { owner: 'habitflow', name: 'get_logs', kind: 'read', tier: 0 },
  { owner: 'habitflow', name: 'create_habit', kind: 'write', tier: 1 },
  { owner: 'habitflow', name: 'update_habit', kind: 'write', tier: 1 },
  { owner: 'habitflow', name: 'toggle_log', kind: 'write', tier: 1 },
  { owner: 'habitflow', name: 'delete_habit', kind: 'write', tier: 3 },

  // linksnap
  { owner: 'linksnap', name: 'list_links', kind: 'read', tier: 0 },
  { owner: 'linksnap', name: 'get_analytics', kind: 'read', tier: 0 },
  { owner: 'linksnap', name: 'create_link', kind: 'write', tier: 1 },
  { owner: 'linksnap', name: 'update_link', kind: 'write', tier: 1 },
  { owner: 'linksnap', name: 'delete_link', kind: 'write', tier: 3 },

  // profile
  { owner: 'account', name: 'get', kind: 'read', tier: 0 },
  { owner: 'account', name: 'update', kind: 'write', tier: 1 },

  // spendtrack
  { owner: 'spendtrack', name: 'list_categories', kind: 'read', tier: 0 },
  {
    owner: 'spendtrack',
    name: 'list_transactions',
    kind: 'read',
    tier: 0,
  },
  { owner: 'spendtrack', name: 'get_summary', kind: 'read', tier: 0 },
  { owner: 'spendtrack', name: 'list_budgets', kind: 'read', tier: 0 },
  {
    owner: 'spendtrack',
    name: 'create_expense',
    kind: 'write',
    tier: 1,
  },
  {
    owner: 'spendtrack',
    name: 'update_expense',
    kind: 'write',
    tier: 1,
  },
  {
    owner: 'spendtrack',
    name: 'delete_expense',
    kind: 'write',
    tier: 3,
  },
  {
    owner: 'spendtrack',
    name: 'create_category',
    kind: 'write',
    tier: 1,
  },
  { owner: 'spendtrack', name: 'set_budget', kind: 'write', tier: 1 },

  // the server itself: a mechanism, not a product operation
  { owner: 'assistant', name: 'server_info', kind: 'read', tier: 0 },
];

/** The 37 capabilities the MCP door declares, in registry order. */
export function mcpCapabilities(): Capability[] {
  return ROWS.map((row) => ({
    id: `${row.owner}.${row.name}`,
    owner: row.owner,
    kind: row.kind,
    tier: row.tier,
    agentName: null,
    mcpName: publicName(row),
  }));
}

/**
 * The name the server registers, which the modules still write out themselves.
 * `profile` is the module's name for the account's two tools; `server_info` is
 * the only one with no product segment.
 */
function publicName(row: McpRow): string {
  if (row.owner === 'assistant') return `${MCP_SERVER_NAME}_${row.name}`;
  if (row.owner === 'account') return `${MCP_SERVER_NAME}_profile_${row.name}`;
  return `${MCP_SERVER_NAME}_${row.owner}_${row.name}`;
}

/**
 * The public name a module registers under, from the table rather than a literal
 * repeated in seven files. A row that is missing is a build-time mistake, not a
 * quiet `undefined` registration: the server would accept one and answer nothing.
 */
export function mcpCapabilityName(id: string): string {
  const entry = mcpCapabilities().find((candidate) => candidate.id === id);
  if (!entry?.mcpName) throw new Error(`Unknown MCP capability: ${id}`);
  return entry.mcpName;
}
