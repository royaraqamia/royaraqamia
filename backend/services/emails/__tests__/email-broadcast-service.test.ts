import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EmailBroadcastService } from '@/backend/services/emails/email-broadcast-service';

function makeService(recipients: Array<{ id: string; email: string }>, sent = 3) {
  const repository = {
    search: vi.fn(),
    findExistingUserIds: vi.fn(),
    findRecipientEmails: vi.fn().mockResolvedValue(recipients),
  };
  const emailClient = {
    sendOtpEmail: vi.fn(),
    sendPasswordResetEmail: vi.fn(),
    sendBroadcastEmails: vi.fn().mockResolvedValue(sent),
  };
  const service = new EmailBroadcastService(repository, emailClient);
  return { service, repository, emailClient };
}

describe('EmailBroadcastService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('resolves all users and sends every email', async () => {
    const { service, repository, emailClient } = makeService([
      { id: 'u-1', email: 'a@example.com' },
      { id: 'u-2', email: 'b@example.com' },
    ]);

    const count = await service.broadcast({ subject: 'تحديث', body: 'مرحباً' });

    expect(count).toBe(3);
    expect(repository.findRecipientEmails).toHaveBeenCalledWith(undefined);
    expect(emailClient.sendBroadcastEmails).toHaveBeenCalledWith([
      { email: 'a@example.com', subject: 'تحديث', body: 'مرحباً' },
      { email: 'b@example.com', subject: 'تحديث', body: 'مرحباً' },
    ]);
  });

  it('passes the given userIds to the repository', async () => {
    const { service, repository } = makeService([{ id: 'u-1', email: 'a@example.com' }]);

    await service.broadcast({ subject: 'تحديث' }, ['u-1', 'u-2']);

    expect(repository.findRecipientEmails).toHaveBeenCalledWith(['u-1', 'u-2']);
  });

  it('filters users without a usable email', async () => {
    const { service, emailClient } = makeService([
      { id: 'u-1', email: 'a@example.com' },
      { id: 'u-2', email: '   ' },
      { id: 'u-3', email: '' },
    ]);

    const count = await service.broadcast({ subject: 'تحديث' });

    expect(count).toBe(3);
    expect(emailClient.sendBroadcastEmails).toHaveBeenCalledWith([
      { email: 'a@example.com', subject: 'تحديث', body: undefined },
    ]);
  });

  it('returns 0 and does not call the client when no recipients resolve', async () => {
    const { service, emailClient } = makeService([]);

    const count = await service.broadcast({ subject: 'تحديث' });

    expect(count).toBe(0);
    expect(emailClient.sendBroadcastEmails).not.toHaveBeenCalled();
  });
});
