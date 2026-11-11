import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const candidates = vi.fn(async () => ({
  candidates: [],
  coverage: { eligible: 0, published: 0, waiting: 0 },
}));
const act = vi.fn(async () => undefined);

vi.mock('@/backend/config/mcp', () => ({
  createDefaultMcpCatalogAgentService: () => ({ candidates, act }),
}));

import { runMcpCatalogAgent } from '../mcp-catalog-agent';

/**
 * The scoped door's credential and its verb allowlist. A missing token must
 * refuse rather than run: the job that cannot find one is supposed to fail, not
 * to report a successful run over nothing.
 */

const TOKEN = 'agent-token';
const headers = (value?: string) =>
  new Headers(value === undefined ? {} : { authorization: `Bearer ${value}` });

describe('the catalogue agent door', () => {
  beforeEach(() => {
    process.env.MCP_CATALOG_AGENT_TOKEN = TOKEN;
    candidates.mockClear();
    act.mockClear();
  });

  afterEach(() => {
    delete process.env.MCP_CATALOG_AGENT_TOKEN;
  });

  it('refuses a request with no credential, and with the wrong one', async () => {
    const missing = await runMcpCatalogAgent(headers(), JSON.stringify({ action: 'list' }));
    const wrong = await runMcpCatalogAgent(headers('not-it'), JSON.stringify({ action: 'list' }));

    expect(missing).toMatchObject({ status: 401 });
    expect(wrong).toMatchObject({ status: 401 });
    expect(candidates).not.toHaveBeenCalled();
  });

  it('refuses every request when the token is not configured', async () => {
    delete process.env.MCP_CATALOG_AGENT_TOKEN;

    const result = await runMcpCatalogAgent(headers(TOKEN), JSON.stringify({ action: 'list' }));

    expect(result).toMatchObject({ status: 401 });
  });

  it('hands out candidates to the right bearer', async () => {
    const result = await runMcpCatalogAgent(
      headers(TOKEN),
      JSON.stringify({ action: 'list', limit: 3 })
    );

    expect(result).toMatchObject({ status: 200 });
    expect(candidates).toHaveBeenCalledWith(3);
  });

  it('refuses a verb the capability does not have', async () => {
    const result = await runMcpCatalogAgent(
      headers(TOKEN),
      JSON.stringify({ action: 'block', registryName: 'com.github/mcp' })
    );

    expect(result).toMatchObject({ status: 400 });
    expect(act).not.toHaveBeenCalled();
  });

  it('applies an allowed act', async () => {
    const result = await runMcpCatalogAgent(
      headers(TOKEN),
      JSON.stringify({
        action: 'skip',
        registryName: 'com.github/mcp',
        reason: 'no_mark',
      })
    );

    expect(result).toMatchObject({ status: 200 });
    expect(act).toHaveBeenCalledWith({
      action: 'skip',
      registryName: 'com.github/mcp',
      reason: 'no_mark',
      detail: null,
    });
  });
});
