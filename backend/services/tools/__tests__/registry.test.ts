import { describe, expect, it } from 'vitest';

import {
  agentCapabilities,
  capabilityId,
  PRODUCTS,
  TOOL_TIERS,
  type CapabilityOwner,
} from '@/backend/services/tools/registry';
import { mcpCapabilities } from '@/backend/services/tools/mcp-capabilities';
import { createMcpServer } from '@/backend/services/mcp/tools/registry';
import type { McpUserContext } from '@/backend/services/mcp/session';
import { CHAT_AGENT_TOOL_NAMES } from '@/shared/contracts/chat-agent-actions';

/**
 * The registry's own contract (ADR-0183, ADR-0180).
 *
 * These assertions are the reason the tier is a field rather than a comment: a
 * capability that loses its owner, its tier, or its place in the contract fails
 * here rather than quietly becoming automatic in a turn.
 */

const expectedPerOwner: Record<CapabilityOwner, number> = {
  news: 2,
  rates: 2,
  // The three content apps' reads (#1430).
  scan: 1,
  quran: 4,
  athkar: 2,
  // The five hands each product gained in #1431.
  linksnap: 5,
  habitflow: 3,
  spendtrack: 3,
  notes: 5,
  community: 5,
  account: 3,
  certificates: 1,
  consultations: 3,
  training: 1,
  'client-work': 1,
  admin: 0,
  assistant: 5,
};

describe('the assistant door', () => {
  const capabilities = agentCapabilities();

  it('declares every tool the contract names, once', () => {
    expect(capabilities.map((entry) => entry.agentName).sort()).toEqual(
      [...CHAT_AGENT_TOOL_NAMES].sort()
    );
    expect(new Set(capabilities.map((entry) => entry.id)).size).toBe(capabilities.length);
  });

  it('gives every capability an owner the product list knows', () => {
    const known = new Set<string>([...PRODUCTS, 'assistant']);
    for (const entry of capabilities) {
      expect(known.has(entry.owner)).toBe(true);
      expect(entry.id).toBe(capabilityId(entry.owner, entry.agentName ?? ''));
    }
  });

  it('puts a read at tier 0 and a write above it', () => {
    for (const entry of capabilities) {
      expect(TOOL_TIERS).toContain(entry.tier);
      if (entry.kind === 'read') expect(entry.tier).toBe(0);
      else expect(entry.tier).toBeGreaterThan(0);
    }
  });

  it('keeps the per-product coverage the roadmap states', () => {
    const counts = Object.fromEntries(
      [...PRODUCTS, 'assistant'].map((owner) => [
        owner,
        capabilities.filter((entry) => entry.owner === owner).length,
      ])
    );

    expect(counts).toEqual(expectedPerOwner);
  });

  it('keeps the blast radius split the program was decided on', () => {
    const writes = capabilities.filter((entry) => entry.kind === 'write');
    expect(
      writes
        .filter((entry) => entry.tier === 1)
        .map((entry) => entry.agentName)
        .sort()
    ).toEqual([
      'change_display_name',
      'create_habit',
      'create_link',
      'create_note',
      'create_post_draft',
      'edit_expense',
      'edit_post_draft',
      'record_expense',
      'remember',
      'set_habit_reminder',
      'update_link',
      'update_note',
    ]);
    // A third party can see it, or money moves: never grantable (ADR-0180).
    expect(
      writes
        .filter((entry) => entry.tier === 2)
        .map((entry) => entry.agentName)
        .sort()
    ).toEqual([
      'apply_training',
      'book_consultation',
      'publish_post_draft',
      'submit_project_request',
    ]);
    // The first tier-3 writes on the turn: a delete whose card names its target.
    expect(
      writes
        .filter((entry) => entry.tier === 3)
        .map((entry) => entry.agentName)
        .sort()
    ).toEqual(['delete_link', 'delete_note']);
  });

  it('names the public MCP tool where a capability exists on both doors', () => {
    const byId = new Map(capabilities.map((entry) => [entry.id, entry]));

    for (const name of [
      'list_links',
      'get_analytics',
      'create_link',
      'update_link',
      'delete_link',
    ]) {
      expect(byId.get(`linksnap.${name}`)?.mcpName).toBe(`royaraqamia_linksnap_${name}`);
    }
    for (const name of ['list_notes', 'get_note', 'create_note', 'update_note', 'delete_note']) {
      expect(byId.get(`notes.${name}`)?.mcpName).toBeNull();
    }
  });

  it('marks the turn’s own mechanisms as the assistant’s, not a product’s', () => {
    const mechanisms = capabilities.filter((entry) => entry.owner === 'assistant');
    expect(mechanisms.map((entry) => entry.agentName).sort()).toEqual([
      'find_app_tools',
      'get_screen_context',
      'list_specialists',
      'load_specialist',
      'search_web',
    ]);
  });
});

describe('the MCP door', () => {
  const anonymous: McpUserContext = {
    userId: null,
    email: null,
    isAdmin: false,
    scopes: [],
    clientId: null,
    tokenExpiresAt: null,
    supabase: {} as never,
  };

  /**
   * The SDK keeps its registrations on the instance and offers no list. Reading
   * it in a test is deliberate: it is the only way to prove the declaration
   * table and the server agree, and a private rename breaks this test loudly
   * rather than letting the table drift silently.
   */
  function registeredNames(): string[] {
    const server = createMcpServer(anonymous) as unknown as {
      _registeredTools: Record<string, unknown>;
    };
    return Object.keys(server._registeredTools).sort();
  }

  it('declares every tool the server registers, once', () => {
    const declared = mcpCapabilities()
      .map((entry) => entry.mcpName)
      .filter((name): name is string => typeof name === 'string')
      .sort();

    expect(declared).toEqual(registeredNames());
    expect(new Set(declared).size).toBe(declared.length);
  });

  it('gives every MCP tool a tier that matches its kind', () => {
    for (const entry of mcpCapabilities()) {
      expect(TOOL_TIERS).toContain(entry.tier);
      if (entry.kind === 'read') expect(entry.tier).toBe(0);
      else expect(entry.tier).toBeGreaterThan(0);
    }
  });
});
