import { describe, expect, it, vi } from 'vitest';

import type {
  ChatReportRecord,
  ChatReportsAdminRepository,
} from '@/backend/repositories/chat/chat-reports-admin-repository';
import type { PublicUsersRepository } from '@/backend/repositories/users/public-users-repository';
import {
  ChatReportNotFoundError,
  createChatReportsAdminService,
} from '@/backend/services/chat/chat-reports-admin-service';
import type { ChatReportStatus } from '@/shared/contracts/chat-reports';
import type { PublicUser } from '@/shared/contracts/users';

const SNAPSHOT = [
  {
    id: 'm1',
    senderId: 'u2',
    senderKind: 'user' as const,
    body: 'رسالة مسيئة',
    createdAt: '2026-11-05T09:58:00.000Z',
    deleted: false,
  },
  {
    id: 'm2',
    senderId: 'u1',
    senderKind: 'user' as const,
    body: 'توقّف عن هذا',
    createdAt: '2026-11-05T09:59:00.000Z',
    deleted: false,
  },
];

function record(overrides: Partial<ChatReportRecord> = {}): ChatReportRecord {
  return {
    id: 'report-1',
    conversationId: 'conversation-1',
    reporterId: 'u1',
    reportedUserId: 'u2',
    reason: 'إساءة في الحديث',
    snapshot: SNAPSHOT,
    status: 'open',
    createdAt: '2026-11-05T10:00:00.000Z',
    ...overrides,
  };
}

function user(overrides: Partial<PublicUser> = {}): PublicUser {
  return {
    id: 'u1',
    username: 'sara',
    name: 'سارة',
    avatar_url: null,
    bio: null,
    verified: true,
    ...overrides,
  };
}

function reports(overrides: Partial<ChatReportsAdminRepository> = {}) {
  return {
    list: vi.fn(async () => [record()]),
    findById: vi.fn(async () => record()),
    setStatus: vi.fn(async (_id: string, status: ChatReportStatus) => record({ status })),
    findConversations: vi.fn(async () => [
      { id: 'conversation-1', kind: 'group' as const, title: 'فريق التصميم' },
    ]),
    ...overrides,
  } satisfies ChatReportsAdminRepository;
}

function users(overrides: Partial<Pick<PublicUsersRepository, 'getMany'>> = {}) {
  return {
    getMany: vi.fn(async () => [user(), user({ id: 'u2', username: 'bad', name: 'خالد' })]),
    ...overrides,
  };
}

describe('createChatReportsAdminService', () => {
  it('draws the report with the thread label, both members and the snapshot', async () => {
    const repository = reports();
    const service = createChatReportsAdminService({ reports: repository, users: users() });

    const [row] = await service.list('open');

    expect(repository.list).toHaveBeenCalledWith('open', 100);
    expect(row).toMatchObject({
      id: 'report-1',
      conversation: { id: 'conversation-1', kind: 'group', title: 'فريق التصميم' },
      reporter: { id: 'u1', username: 'sara', name: 'سارة' },
      reportedUser: { id: 'u2', username: 'bad', name: 'خالد' },
      status: 'open',
      reason: 'إساءة في الحديث',
    });
    expect(row?.snapshot).toEqual(SNAPSHOT);
  });

  it('labels a direct thread by its kind and a group without a name by the fallback', async () => {
    const service = createChatReportsAdminService({
      reports: reports({
        list: vi.fn(async () => [record({ id: 'report-2', conversationId: 'conversation-2' })]),
        findConversations: vi.fn(async () => [
          { id: 'conversation-2', kind: 'direct' as const, title: null },
        ]),
      }),
      users: users(),
    });

    const [row] = await service.list(null);

    expect(row?.conversation.title).toBe('محادثة مباشرة');
  });

  it('keeps the queue readable when one stored snapshot is not the expected shape', async () => {
    const service = createChatReportsAdminService({
      reports: reports({ list: vi.fn(async () => [record({ snapshot: { broken: true } })]) }),
      users: users(),
    });

    const [row] = await service.list('open');

    expect(row?.snapshot).toEqual([]);
  });

  it('records reviewed through the repository and answers the updated row', async () => {
    const repository = reports();
    const service = createChatReportsAdminService({ reports: repository, users: users() });

    const row = await service.decide('report-1', 'reviewed');

    expect(repository.setStatus).toHaveBeenCalledWith('report-1', 'reviewed');
    expect(row.status).toBe('reviewed');
  });

  it('treats a repeated decision as the same outcome, without a second write', async () => {
    const repository = reports({
      findById: vi.fn(async () => record({ status: 'dismissed' })),
    });
    const service = createChatReportsAdminService({ reports: repository, users: users() });

    const row = await service.decide('report-1', 'dismissed');

    expect(repository.setStatus).not.toHaveBeenCalled();
    expect(row.status).toBe('dismissed');
  });

  it('refuses a report that no longer exists', async () => {
    const service = createChatReportsAdminService({
      reports: reports({ findById: vi.fn(async () => null) }),
      users: users(),
    });

    await expect(service.decide('missing', 'reviewed')).rejects.toBeInstanceOf(
      ChatReportNotFoundError
    );
  });
});
