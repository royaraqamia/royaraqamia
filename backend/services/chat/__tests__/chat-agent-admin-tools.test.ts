import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ChatAgentActionService } from '@/backend/services/chat/chat-agent-action-service';
import type { ChatAgentActionRepository } from '@/backend/repositories/chat/chat-agent-action-repository';
import type { ChatService } from '@/backend/services/chat/chat-service';
import {
  chatAgentTool,
  chatAgentToolDefinitionsForTurn,
  type ChatAgentToolContext,
} from '@/backend/services/chat/chat-agent-tools';
import { MissingScopeError } from '@/backend/services/mcp/tools/guards';
import {
  ADMIN_AGENT_TOOL_NAMES,
  type ChatAgentAction,
} from '@/shared/contracts/chat-agent-actions';

const adminUsers = vi.hoisted(() => ({ list: vi.fn() }));
vi.mock('@/backend/config/users', () => ({
  createAdminUsersService: () => ({ list: adminUsers.list }),
  createProfileService: () => ({}),
}));

const reports = vi.hoisted(() => ({ list: vi.fn(), decide: vi.fn() }));
vi.mock('@/backend/config/chat-reports', () => ({
  createDefaultChatReportsAdminService: () => ({
    list: reports.list,
    decide: reports.decide,
  }),
}));

const ADMIN_ID = 'admin-1';

/** The caller's own session as the executor re-reads it. */
function session(user: { id: string; email: string } | null) {
  return {
    auth: {
      getUser: vi.fn(async () => ({
        data: { user },
        error: user ? null : new Error('no session'),
      })),
    },
  } as never;
}

function context(email = 'admin@example.com', id = ADMIN_ID): ChatAgentToolContext {
  return { userId: id, supabase: session({ id, email }), ip: '127.0.0.1' };
}

const memberContext = () => context('member@example.com', 'member-1');

describe('the admin capabilities (#1435, ADR-0180 decision 10)', () => {
  beforeEach(() => {
    vi.stubEnv('ADMIN_EMAILS', 'admin@example.com');
    adminUsers.list.mockReset().mockResolvedValue([
      {
        id: 'member-1',
        name: 'عضو',
        email: 'member@example.com',
        avatar_url: null,
        is_hidden: true,
      },
    ]);
    reports.list.mockReset().mockResolvedValue([]);
    reports.decide.mockReset().mockResolvedValue({ id: 'report-1', status: 'reviewed' });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('declares no admin capability to a member’s turn and all of them to an admin’s', () => {
    const names = (isAdmin: boolean) =>
      chatAgentToolDefinitionsForTurn({
        hasApps: false,
        hasScreen: false,
        hasWebSearch: false,
        hasUrlExtract: false,
        isAdmin,
      }).map((definition) => definition.function.name);

    for (const name of ADMIN_AGENT_TOOL_NAMES) expect(names(false)).not.toContain(name);
    for (const name of ADMIN_AGENT_TOOL_NAMES) expect(names(true)).toContain(name);
  });

  it('refuses a direct call from a member, whatever the declaration filter did', async () => {
    const tool = chatAgentTool('admin_list_members');
    await expect(tool!.run({}, memberContext())).rejects.toBeInstanceOf(MissingScopeError);
    expect(adminUsers.list).not.toHaveBeenCalled();
  });

  it('refuses a session that names a different member than the turn', async () => {
    const tool = chatAgentTool('admin_list_reports');
    const borrowed = {
      userId: ADMIN_ID,
      supabase: session({ id: 'someone-else', email: 'admin@example.com' }),
      ip: '127.0.0.1',
    } satisfies ChatAgentToolContext;

    await expect(tool!.run({}, borrowed)).rejects.toBeInstanceOf(MissingScopeError);
  });

  it('reads the member directory for an admin, hidden state included', async () => {
    const answer = await chatAgentTool('admin_list_members')!.run(
      { search: 'عضو', limit: 10 },
      context()
    );

    expect(adminUsers.list).toHaveBeenCalledWith('عضو', 10);
    expect(answer).toEqual([expect.objectContaining({ id: 'member-1', is_hidden: true })]);
  });

  it('reads the report queue for an admin', async () => {
    await chatAgentTool('admin_list_reports')!.run({ status: 'open' }, context());
    expect(reports.list).toHaveBeenCalledWith('open');
  });

  it('records the report decision only for an admin', async () => {
    await chatAgentTool('admin_decide_report')!.run(
      { id: '11111111-1111-4111-8111-111111111111', status: 'reviewed' },
      context()
    );
    expect(reports.decide).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111', 'reviewed');
  });

  describe('the confirm path', () => {
    function repository(row: ChatAgentAction) {
      let current = { ...row };
      const repo: ChatAgentActionRepository = {
        listForMessages: vi.fn(async () => [current]),
        find: vi.fn(async () => ({ ...current })),
        claim: vi.fn(async (_conversationId, _actionId, userId) => {
          if (current.status !== 'proposed') return null;
          current = {
            ...current,
            status: 'confirmed',
            resolvedBy: userId,
            resolvedAt: '2026-11-23T04:00:00.000Z',
          };
          return { ...current };
        }),
        reject: vi.fn(async () => null),
        settle: vi.fn(async (_conversationId, _actionId, status, result) => {
          current = { ...current, status, result, resolvedAt: '2026-11-23T04:00:00.000Z' };
          return { ...current };
        }),
        insertProposal: vi.fn(async () => ({ ...current })),
      };
      return repo;
    }

    function proposal(): ChatAgentAction {
      return {
        id: 'action-1',
        conversationId: 'conversation-1',
        messageId: 'message-1',
        tool: 'admin_decide_report',
        args: { id: '11111111-1111-4111-8111-111111111111', status: 'reviewed' },
        status: 'proposed',
        result: null,
        createdAt: '2026-11-23T03:59:00.000Z',
        resolvedAt: null,
        resolvedBy: null,
      };
    }

    function service(actions: ChatAgentActionRepository) {
      return new ChatAgentActionService({
        actions,
        agent: {} as never,
        chats: {
          getThread: vi.fn(async () => ({ kind: 'agent' })),
        } as unknown as ChatService,
        resolveTool: (name) => chatAgentTool(name),
        reserveAppCall: vi.fn(),
      });
    }

    it('names the admin who confirmed an applied decision', async () => {
      const actions = repository(proposal());
      const action = await service(actions).confirm(ADMIN_ID, 'conversation-1', 'action-1', {
        supabase: session({ id: ADMIN_ID, email: 'admin@example.com' }) as never,
        ip: '127.0.0.1',
      });

      expect(action.status).toBe('applied');
      expect(action.resolvedBy).toBe(ADMIN_ID);
      expect(actions.claim).toHaveBeenCalledWith('conversation-1', 'action-1', ADMIN_ID);
    });

    it('refuses a confirmation from a member who lost the flag, in their words', async () => {
      const actions = repository(proposal());
      const action = await service(actions).confirm('member-1', 'conversation-1', 'action-1', {
        supabase: session({ id: 'member-1', email: 'member@example.com' }) as never,
        ip: '127.0.0.1',
      });

      expect(action.status).toBe('failed');
      expect(action.result).toEqual({ error: 'هذه الأداة متاحة للمشرفين فقط.' });
      expect(reports.decide).not.toHaveBeenCalled();
    });
  });
});
