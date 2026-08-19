import { describe, it, expect } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createMcpServer } from '../tools/registry';
import type { McpUserContext } from '../session';

const anonymousCtx: McpUserContext = {
  userId: null,
  email: null,
  isAdmin: false,
  scopes: [],
  clientId: null,
  tokenExpiresAt: null,
  supabase: {} as never,
};

describe('createMcpServer', () => {
  it('registers the expected tools', () => {
    const server = createMcpServer(anonymousCtx);
    expect(server).toBeInstanceOf(McpServer);
  });
});

describe('getServerInfoHandler', () => {
  it('returns json with identity and scopes', async () => {
    const { getServerInfoHandler } = await import('../tools/system');
    const ctx: McpUserContext = {
      ...anonymousCtx,
      userId: 'u1',
      email: 'a@b.com',
      isAdmin: true,
      scopes: ['blog.read', 'admin'],
    };

    const result = await getServerInfoHandler({ format: 'json' }, ctx);
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent?.server).toBe('royaraqamia');
    expect(result.structuredContent?.user).toEqual({
      userId: 'u1',
      email: 'a@b.com',
      isAdmin: true,
    });
    expect(result.structuredContent?.scopes).toEqual(['blog.read', 'admin']);
  });

  it('returns markdown for anonymous callers', async () => {
    const { getServerInfoHandler } = await import('../tools/system');

    const result = await getServerInfoHandler({ format: 'markdown' }, anonymousCtx);
    expect(result.isError).toBeFalsy();
    expect(result.content[0]?.text).toContain('(anonymous)');
    expect(result.content[0]?.text).toContain('(none)');
  });
});
