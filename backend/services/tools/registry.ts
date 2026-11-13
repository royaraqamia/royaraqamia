import { chatAgentTools } from '@/backend/services/chat/chat-agent-tools';

/**
 * The capability registry (ADR-0183).
 *
 * A capability is one thing a product can do on a member's behalf, declared
 * once with the blast radius that decides what happens to a call (ADR-0180).
 * The assistant is the first door to read it; the MCP modules adopt the same
 * entries in the change that follows, which is why `mcpName` exists here and is
 * null until that door reads the entry rather than its own literal.
 *
 * `owner` is the coverage axis, not a module path: the nine apps from the apps
 * sheet, then the surfaces a member reaches from the account and chat shell,
 * and `assistant` for a mechanism that is not a product operation at all — the
 * app-tool search and the specialist roster.
 */

export const TOOL_TIERS = [0, 1, 2, 3] as const;

/**
 * What happens to a call, from the member's point of view (ADR-0180).
 *
 * 0 runs inside the turn. 1 may run inside the turn once the member grants that
 * tool, and is a card until then. 2 is always a card: a third party can see it
 * or money moves. 3 is a card, and the confirm names the target.
 */
export type ToolTier = (typeof TOOL_TIERS)[number];

export const PRODUCTS = [
  'news',
  'rates',
  'scan',
  'quran',
  'athkar',
  'linksnap',
  'habitflow',
  'spendtrack',
  'notes',
  'community',
  'account',
  'certificates',
  'consultations',
  'training',
  'client-work',
  'admin',
] as const;

export type ProductKey = (typeof PRODUCTS)[number];

/** A product, or the assistant itself for a mechanism that belongs to no product. */
export type CapabilityOwner = ProductKey | 'assistant';

export interface Capability {
  /** `<owner>.<short name>`: stable across a rename of either door. */
  id: string;
  owner: CapabilityOwner;
  kind: 'read' | 'write';
  tier: ToolTier;
  /** The name the assistant's turn calls it by, when the turn can call it. */
  agentName: string | null;
  /** The MCP server's public name, when that door declares it. */
  mcpName: string | null;
}

export function capabilityId(owner: CapabilityOwner, name: string): string {
  return `${owner}.${name}`;
}

/**
 * Every capability the assistant's door declares, in registry order.
 *
 * It is derived from the tool entries rather than kept beside them, so a tool
 * cannot exist without a tier and a product, and the coverage report cannot
 * disagree with what the turn can actually call.
 */
export function agentCapabilities(): Capability[] {
  return chatAgentTools().map((tool) => ({
    id: capabilityId(tool.product, tool.name),
    owner: tool.product,
    kind: tool.kind,
    tier: tool.tier,
    agentName: tool.name,
    mcpName: null,
  }));
}
