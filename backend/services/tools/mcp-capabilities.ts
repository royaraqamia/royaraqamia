import { MCP_SERVER_NAME } from '@/backend/services/mcp/constants';
import type { McpScope } from '@/backend/services/mcp/scope';
import type { Capability, CapabilityOwner } from '@/backend/services/tools/registry';

/**
 * The MCP server's half of the capability registry (ADR-0183).
 *
 * The modules in `backend/services/mcp/tools/` still register their own
 * literals and format their own answers; this table is the declaration they are
 * measured against, and `mcp-capabilities.test.ts` fails the moment the two
 * disagree. The change that follows moves each module onto these rows, so the
 * name, scope and tier have one home instead of two.
 *
 * `owner` is the capability's product, not the module that happens to carry it:
 * `certificates.verify` is a certificate read whether it is called from the
 * server or, one day, from a turn.
 */

interface McpRow {
  owner: CapabilityOwner;
  /** The short name, without the server prefix. */
  name: string;
  kind: 'read' | 'write';
  tier: Capability['tier'];
  scope: McpScope | null;
}

const ROWS: McpRow[] = [
  // certificates
  { owner: 'certificates', name: 'list', kind: 'read', tier: 0, scope: 'certificates.read' },
  { owner: 'certificates', name: 'list_mine', kind: 'read', tier: 0, scope: 'certificates.read' },
  { owner: 'certificates', name: 'get', kind: 'read', tier: 0, scope: 'certificates.read' },
  { owner: 'certificates', name: 'verify', kind: 'read', tier: 0, scope: 'certificates.read' },
  { owner: 'certificates', name: 'create', kind: 'write', tier: 2, scope: 'certificates.write' },
  { owner: 'certificates', name: 'update', kind: 'write', tier: 2, scope: 'certificates.write' },
  { owner: 'certificates', name: 'delete', kind: 'write', tier: 3, scope: 'certificates.write' },

  // community
  { owner: 'community', name: 'list_posts', kind: 'read', tier: 0, scope: 'community.read' },
  { owner: 'community', name: 'get_post', kind: 'read', tier: 0, scope: 'community.read' },
  { owner: 'community', name: 'create_post', kind: 'write', tier: 1, scope: 'community.write' },
  { owner: 'community', name: 'update_post', kind: 'write', tier: 1, scope: 'community.write' },
  { owner: 'community', name: 'publish_post', kind: 'write', tier: 2, scope: 'community.write' },
  { owner: 'community', name: 'unpublish_post', kind: 'write', tier: 1, scope: 'community.write' },
  { owner: 'community', name: 'delete_post', kind: 'write', tier: 3, scope: 'community.write' },

  // habitflow
  { owner: 'habitflow', name: 'list_habits', kind: 'read', tier: 0, scope: 'habitflow.read' },
  { owner: 'habitflow', name: 'get_logs', kind: 'read', tier: 0, scope: 'habitflow.read' },
  { owner: 'habitflow', name: 'create_habit', kind: 'write', tier: 1, scope: 'habitflow.write' },
  { owner: 'habitflow', name: 'update_habit', kind: 'write', tier: 1, scope: 'habitflow.write' },
  { owner: 'habitflow', name: 'toggle_log', kind: 'write', tier: 1, scope: 'habitflow.write' },
  { owner: 'habitflow', name: 'delete_habit', kind: 'write', tier: 3, scope: 'habitflow.write' },

  // linksnap
  { owner: 'linksnap', name: 'list_links', kind: 'read', tier: 0, scope: 'linksnap.read' },
  { owner: 'linksnap', name: 'get_analytics', kind: 'read', tier: 0, scope: 'linksnap.read' },
  { owner: 'linksnap', name: 'create_link', kind: 'write', tier: 1, scope: 'linksnap.write' },
  { owner: 'linksnap', name: 'update_link', kind: 'write', tier: 1, scope: 'linksnap.write' },
  { owner: 'linksnap', name: 'delete_link', kind: 'write', tier: 3, scope: 'linksnap.write' },

  // profile
  { owner: 'account', name: 'get', kind: 'read', tier: 0, scope: 'profile.read' },
  { owner: 'account', name: 'update', kind: 'write', tier: 1, scope: 'profile.write' },

  // spendtrack
  { owner: 'spendtrack', name: 'list_categories', kind: 'read', tier: 0, scope: 'spendtrack.read' },
  {
    owner: 'spendtrack',
    name: 'list_transactions',
    kind: 'read',
    tier: 0,
    scope: 'spendtrack.read',
  },
  { owner: 'spendtrack', name: 'get_summary', kind: 'read', tier: 0, scope: 'spendtrack.read' },
  { owner: 'spendtrack', name: 'list_budgets', kind: 'read', tier: 0, scope: 'spendtrack.read' },
  {
    owner: 'spendtrack',
    name: 'create_expense',
    kind: 'write',
    tier: 1,
    scope: 'spendtrack.write',
  },
  {
    owner: 'spendtrack',
    name: 'update_expense',
    kind: 'write',
    tier: 1,
    scope: 'spendtrack.write',
  },
  {
    owner: 'spendtrack',
    name: 'delete_expense',
    kind: 'write',
    tier: 3,
    scope: 'spendtrack.write',
  },
  {
    owner: 'spendtrack',
    name: 'create_category',
    kind: 'write',
    tier: 1,
    scope: 'spendtrack.write',
  },
  { owner: 'spendtrack', name: 'set_budget', kind: 'write', tier: 1, scope: 'spendtrack.write' },

  // the server itself: a mechanism, not a product operation
  { owner: 'assistant', name: 'server_info', kind: 'read', tier: 0, scope: null },
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

/** The scope a row asks for, for the change that makes the modules read this table. */
export function mcpCapabilityScope(id: string): McpScope | null {
  const row = ROWS.find((candidate) => `${candidate.owner}.${candidate.name}` === id);
  return row?.scope ?? null;
}
