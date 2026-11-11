import { describe, expect, it } from 'vitest';

import {
  appToolDeclarations,
  appToolName,
  attachAppNames,
  planAppTools,
  searchAppTools,
} from '@/backend/services/chat/chat-app-tools';
import type { McpAppTool } from '@/backend/services/mcp/marketplace/app-tools-service';
import type { ChatAgentAction } from '@/shared/contracts/chat-agent-actions';

/**
 * The router, the names, and the card's app (ADR-0155, decisions 7 and 11).
 *
 * The cost of this design is a miss, so what these pin is that a miss is
 * recoverable (`find_app_tools`), that an unrelated question carries no remote
 * declaration at all, and that a name the model saw in one turn is the same
 * name it sees in the next.
 */

function tool(patch: Partial<McpAppTool> = {}): McpAppTool {
  return {
    connectionId: 'conn-1',
    appName: 'Notion',
    toolName: 'search',
    description: 'Search pages and databases',
    inputSchema: { type: 'object', properties: { query: { type: 'string' } } },
    readOnly: true,
    permissionLevel: 'ask',
    ...patch,
  };
}

describe('the model-visible name', () => {
  it('is app_<app>_<tool>, in ASCII, at most 64 characters', () => {
    expect(appToolName('Notion', 'search')).toBe('app_notion_search');
    expect(appToolName('Acme CRM', 'contacts.list')).toBe('app_acme_crm_contacts_list');

    const long = appToolName('a'.repeat(80), 'b'.repeat(40));
    expect(long.length).toBeLessThanOrEqual(64);
    expect(long).toMatch(/^[a-z0-9_]+$/);
  });

  it('falls back to the tool when the app has no Latin name to slug', () => {
    expect(appToolName('نوشن', 'search')).toBe('app_search');
  });

  it('is unique per member, even for two apps with the same name', () => {
    const names = appToolDeclarations([
      tool({ connectionId: 'conn-2' }),
      tool({ connectionId: 'conn-1' }),
    ]).map((declaration) => declaration.name);

    expect(new Set(names).size).toBe(2);
    expect(names).toContain('app_notion_search');
  });
});

describe('the router', () => {
  it('declares nothing for a question that mentions no app', () => {
    const planned = planAppTools([tool()], 'كم صرفت هذا الشهر؟');

    expect(planned).toEqual([]);
  });

  it('declares the app a member names, and ranks a tool name above a description', () => {
    const catalog = [
      tool({ toolName: 'search', description: 'Search pages' }),
      tool({ toolName: 'create_page', description: 'Add a page to Notion', readOnly: false }),
    ];

    const planned = planAppTools(catalog, 'ابحث لي في Notion عن صفحة');

    expect(planned.map((declaration) => declaration.toolName)).toContain('search');
    expect(planned.length).toBeGreaterThan(0);
  });

  it('never declares more than sixteen tools', () => {
    const catalog = Array.from({ length: 30 }, (_, index) =>
      tool({ toolName: `tool_${index}`, description: 'Notion page' })
    );

    expect(planAppTools(catalog, 'Notion')).toHaveLength(16);
  });

  it('does not offer a write from an app the member limited to reads', () => {
    const catalog = [
      tool({ toolName: 'search', readOnly: true, permissionLevel: 'reads' }),
      tool({ toolName: 'create_page', readOnly: false, permissionLevel: 'reads' }),
    ];

    const planned = planAppTools(catalog, 'Notion');

    expect(planned.map((declaration) => declaration.toolName)).toEqual(['search']);
  });

  it('carries the server’s own schema, and a usable one when it has none', () => {
    const planned = planAppTools([tool()], 'Notion');

    expect(planned[0]?.parameters).toMatchObject({ type: 'object' });
  });
});

describe('the recovery search', () => {
  it('finds a tool the router missed, by the words the model wrote', () => {
    const catalog = [tool({ toolName: 'create_page', description: 'Add a page', readOnly: false })];

    // The member's Arabic sentence never matched; the model's query does.
    expect(planAppTools(catalog, 'أضف صفحة')).toEqual([]);
    expect(searchAppTools(catalog, 'notion create page').map((entry) => entry.name)).toEqual([
      'app_notion_create_page',
    ]);
  });

  it('keeps the name the router would have given, so the next round can call it', () => {
    const catalog = [tool(), tool({ connectionId: 'conn-2', appName: 'Notion', toolName: 'list' })];

    const planned = planAppTools(catalog, 'Notion search');
    const recovered = searchAppTools(catalog, 'notion search');

    expect(recovered[0]?.name).toBe(planned[0]?.name);
  });

  it('answers nothing for a query that matches nothing', () => {
    expect(searchAppTools([tool()], 'weather')).toEqual([]);
  });
});

describe('the card’s app name', () => {
  const action: ChatAgentAction = {
    id: 'action-1',
    conversationId: 'conversation-1',
    messageId: 'message-1',
    tool: 'app:conn-1:create_page',
    args: { title: 'خطة' },
    status: 'proposed',
    result: null,
    createdAt: '2026-11-21T12:00:00.000Z',
    resolvedAt: null,
    resolvedBy: null,
  };

  it('is resolved from the connection, so a rename updates the history', () => {
    const [named] = attachAppNames([action], new Map([['conn-1', 'مساحتي']]));

    expect(named?.appName).toBe('مساحتي');
  });

  it('is null for a connection that is gone, and the card still reads', () => {
    const [named] = attachAppNames([action], new Map());

    expect(named?.appName).toBeNull();
  });

  it('leaves a first-party proposal untouched', () => {
    const firstParty = { ...action, tool: 'record_expense' };
    const [kept] = attachAppNames([firstParty], new Map([['conn-1', 'Notion']]));

    expect(kept).toBe(firstParty);
  });
});
