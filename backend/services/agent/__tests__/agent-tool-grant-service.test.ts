import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import type { AgentToolGrantRepository } from '@/backend/repositories/agent/agent-tool-grant-repository';
import type { ChatAgentTool } from '@/backend/services/chat/chat-agent-tools';
import { AgentToolGrantService } from '@/backend/services/agent/agent-tool-grant-service';
import { AppError } from '@/backend/shared/errors';
import type { AgentToolGrant } from '@/shared/contracts/agent-tool-grants';

function tool(name: string, tier: ChatAgentTool['tier']): ChatAgentTool {
  return {
    name: name as ChatAgentTool['name'],
    kind: tier === 0 ? 'read' : 'write',
    product: 'spendtrack',
    tier,
    description: 'أداة',
    schema: z.strictObject({}),
    run: vi.fn(),
  };
}

const TOOLS = [
  tool('record_expense', 1),
  tool('create_habit', 1),
  tool('publish_post_draft', 2),
  tool('delete_expense', 3),
];

function grant(overrides: Partial<AgentToolGrant> = {}): AgentToolGrant {
  return {
    id: 'grant-1',
    toolId: 'record_expense',
    label: 'record_expense',
    grantedAt: '2026-11-24T10:00:00.000Z',
    lastUsedAt: null,
    ...overrides,
  };
}

function repository(overrides: Partial<AgentToolGrantRepository> = {}) {
  const repo: AgentToolGrantRepository = {
    listLive: vi.fn(async () => []),
    findLive: vi.fn(async () => null),
    create: vi.fn(async ({ toolId }) => grant({ id: 'grant-new', toolId, label: toolId })),
    revoke: vi.fn(async () => grant()),
    touch: vi.fn(async () => undefined),
    appliedTools: vi.fn(async () => []),
    ...overrides,
  };
  return repo;
}

function service(repo: AgentToolGrantRepository) {
  return new AgentToolGrantService({ grants: repo, tools: () => TOOLS });
}

describe('granting a tool (ADR-0180, #1438)', () => {
  it('refuses a tier-2 tool server-side even when it is named directly', async () => {
    const repo = repository();
    await expect(service(repo).grant('user-1', 'publish_post_draft')).rejects.toMatchObject({
      statusCode: 403,
    });
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('refuses a tier-3 tool server-side', async () => {
    const repo = repository();
    await expect(service(repo).grant('user-1', 'delete_expense')).rejects.toBeInstanceOf(AppError);
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('refuses a tool that does not exist', async () => {
    const repo = repository();
    await expect(service(repo).grant('user-1', 'no_such_tool')).rejects.toMatchObject({
      statusCode: 400,
    });
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('refuses a tool the member has not seen run', async () => {
    const repo = repository({ appliedTools: vi.fn(async () => []) });
    await expect(service(repo).grant('user-1', 'record_expense')).rejects.toMatchObject({
      statusCode: 403,
    });
    expect(repo.create).not.toHaveBeenCalled();
  });

  it('creates a tier-1 grant once the member has seen the tool apply', async () => {
    const repo = repository({ appliedTools: vi.fn(async () => ['record_expense']) });
    const created = await service(repo).grant('user-1', 'record_expense', 'settings');

    expect(repo.create).toHaveBeenCalledWith({
      userId: 'user-1',
      toolId: 'record_expense',
      grantedFrom: 'settings',
    });
    expect(created.toolId).toBe('record_expense');
  });

  it('answers the live grant instead of creating a second row', async () => {
    const repo = repository({ findLive: vi.fn(async () => grant()) });
    const answered = await service(repo).grant('user-1', 'record_expense');

    expect(repo.create).not.toHaveBeenCalled();
    expect(answered.id).toBe('grant-1');
  });
});

describe('a live grant the executor may honour (#1438)', () => {
  it('returns null for a tier-2 tool even when a row names it', async () => {
    const repo = repository({
      findLive: vi.fn(async () => grant({ toolId: 'publish_post_draft' })),
    });
    expect(await service(repo).liveFor('user-1', 'publish_post_draft')).toBeNull();
    expect(repo.findLive).not.toHaveBeenCalled();
  });

  it('returns the live row for a tier-1 tool and none after revocation', async () => {
    const live = repository({ findLive: vi.fn(async () => grant()) });
    expect(await service(live).liveFor('user-1', 'record_expense')).toMatchObject({
      id: 'grant-1',
    });

    const revoked = repository({ findLive: vi.fn(async () => null) });
    expect(await service(revoked).liveFor('user-1', 'record_expense')).toBeNull();
  });

  it('404s a revocation that matches no live row of the member', async () => {
    const repo = repository({ revoke: vi.fn(async () => null) });
    await expect(service(repo).revoke('user-1', 'grant-x')).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});

describe('the settings list (#1438)', () => {
  it('offers only tier-1 tools that ran and are not already granted', async () => {
    const repo = repository({
      listLive: vi.fn(async () => [grant({ toolId: 'create_habit' })]),
      appliedTools: vi.fn(async () => ['record_expense', 'create_habit', 'publish_post_draft']),
    });

    const { grantable, grants } = await service(repo).list('user-1');

    expect(grants.map((row) => row.toolId)).toEqual(['create_habit']);
    expect(grantable.map((row) => row.toolId)).toEqual(['record_expense']);
    expect(repo.appliedTools).toHaveBeenCalledWith('user-1', ['record_expense']);
  });
});
