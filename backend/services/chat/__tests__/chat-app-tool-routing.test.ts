import { describe, expect, it } from 'vitest';

import {
  CHAT_APP_TOOL_LIMIT,
  planAppTools,
  searchAppTools,
} from '@/backend/services/chat/chat-app-tools';
import {
  meaningOf,
  productionCatalog,
  productionRouting,
  productionVectors,
} from '@/backend/services/chat/__tests__/support/app-tool-fixtures';
import { APP_TOOL_EMBEDDING } from '@/backend/shared/domain/app-tool-embeddings';

/**
 * The router against the production catalog, in the language the product is
 * used in (#1917, ADR-0223).
 *
 * The reproduction the issue measured: 321 enabled tools over the two live
 * connections, 0 `mcp.call` events, because the router compared Arabic words
 * with English tool names for equality. The fixture is those 321 rows, and the
 * questions are Arabic questions those tools answer. The vectors are pinned by
 * `npm run app-tools:routing` with the deployment's own model, so this is the
 * router that ships, measured on the catalog that failed.
 *
 * Two bars, both from the issue: at least 80% of the questions reach a correct
 * tool, and none of the 20 unrelated Arabic questions declares anything.
 */

const catalog = productionCatalog();
const routing = productionRouting();

describe('the app-tool router against the production catalog', () => {
  it('is pinned at the deployment’s own width and model', () => {
    const pinned = productionVectors(routing);

    expect(routing.version).toBe(1);
    expect(routing.encoding).toBe('int8');
    expect(routing.dimensions).toBe(APP_TOOL_EMBEDDING.dimensions);
    expect(routing.model).toContain('bge-m3');
    expect(routing.toolKeys).toHaveLength(catalog.length);
    expect(pinned?.vectors.length).toBe(catalog.length * APP_TOOL_EMBEDDING.dimensions);
  });

  it('names the app the member would, not its registry key', () => {
    const names = new Set(catalog.map((tool) => tool.appName));

    // `com.vercel/vercel-mcp` is what the row was created with. Reading it back
    // is also what handed the router the word «mcp», which matched all 285.
    expect(names).toContain('Vercel');
    expect(names).toContain('Supabase');
    expect([...names].some((name) => name.includes('/'))).toBe(false);
  });

  it('reaches a correct tool for at least 80% of the Arabic questions', () => {
    const reached = routing.questions.filter((row) => {
      const planned = planAppTools(catalog, row.question, CHAT_APP_TOOL_LIMIT, meaningOf(row));
      const names = planned.map((tool) => tool.toolName);
      return (row.accept ?? []).some((name) => names.includes(name));
    });

    expect(reached.length).toBeGreaterThanOrEqual(Math.ceil(routing.questions.length * 0.8));
  });

  it('declares nothing for any of the 20 unrelated Arabic questions', () => {
    const loud = routing.controls.filter(
      (row) => planAppTools(catalog, row.question, CHAT_APP_TOOL_LIMIT, meaningOf(row)).length > 0
    );

    expect(loud.map((row) => row.question)).toEqual([]);
  });

  it('never carries more than sixteen tools for any question', () => {
    for (const row of [...routing.questions, ...routing.controls]) {
      expect(
        planAppTools(catalog, row.question, CHAT_APP_TOOL_LIMIT, meaningOf(row)).length
      ).toBeLessThanOrEqual(CHAT_APP_TOOL_LIMIT);
    }
  });

  it('recovers through the search path what the router reached', () => {
    const recovered = routing.questions.filter((row) => {
      const found = searchAppTools(catalog, row.question, 8, meaningOf(row));
      const names = found.map((tool) => tool.toolName);
      return (row.accept ?? []).some((name) => names.includes(name));
    });

    expect(recovered.length).toBeGreaterThanOrEqual(Math.ceil(routing.questions.length * 0.8));
  });

  it('names one tool the same way in the router and in the recovery', () => {
    const row = routing.questions[0];
    expect(row).toBeDefined();
    if (!row) return;

    const meaning = meaningOf(row);
    const planned = planAppTools(catalog, row.question, CHAT_APP_TOOL_LIMIT, meaning);
    const found = searchAppTools(catalog, row.question, 8, meaning);
    const names = new Set(planned.map((tool) => tool.name));

    for (const tool of found) expect(names.has(tool.name)).toBe(true);
  });
});
