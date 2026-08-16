import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PushService, type WebPushAdapter } from '@/backend/services/push/push-service';
import type {
  PushSubscriptionRecord,
  PushSubscriptionRepository,
} from '@/backend/repositories/push/push-subscriptions-repository';
import type { PushPayload } from '@/shared/contracts/push';

const payload: PushPayload = { title: 'شهادة جديدة', body: 'نص', type: 'certificate_issued' };

function makeRecord(overrides: Partial<PushSubscriptionRecord> = {}): PushSubscriptionRecord {
  return {
    id: 'sub-1',
    userId: 'u-1',
    endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
    p256dh: 'p256',
    auth: 'auth',
    userAgent: 'Chrome/128',
    createdAt: '2026-08-16T08:00:00.000Z',
    updatedAt: '2026-08-16T08:00:00.000Z',
    ...overrides,
  };
}

function makeRepo() {
  const repository: PushSubscriptionRepository = {
    upsert: vi.fn(),
    findByUserId: vi.fn(async () => []),
    findForUsers: vi.fn(async () => []),
    removeByEndpoint: vi.fn(),
    removeEndpoint: vi.fn(),
  };
  return repository;
}

function makeAdapter() {
  const adapter: WebPushAdapter = {
    setVapidDetails: vi.fn(),
    sendNotification: vi.fn(async () => ({ statusCode: 201 })),
  };
  return adapter;
}

function makeService(
  overrides: {
    repository?: PushSubscriptionRepository;
    adapter?: WebPushAdapter;
    enabled?: boolean;
    allowlist?: string[];
    maxConcurrency?: number;
  } = {}
) {
  const repository = overrides.repository ?? makeRepo();
  const adapter = overrides.adapter ?? makeAdapter();
  const service = new PushService({
    repository,
    enabled: overrides.enabled ?? true,
    vapid: {
      publicKey: 'public-key',
      privateKey: 'private-key',
      subject: 'mailto:admin@royaraqamia.com',
    },
    allowlist: overrides.allowlist ?? ['fcm.googleapis.com'],
    maxConcurrency: overrides.maxConcurrency,
    adapter,
  });
  return { repository, adapter, service };
}

describe('PushService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('enabled mode', () => {
    it('configures VAPID details when enabled', () => {
      const { adapter } = makeService();
      expect(adapter.setVapidDetails).toHaveBeenCalledWith(
        'mailto:admin@royaraqamia.com',
        'public-key',
        'private-key'
      );
    });

    it('sends the JSON payload to every subscription for a user', async () => {
      const { repository, adapter, service } = makeService();
      const records = [
        makeRecord({ endpoint: 'https://fcm.googleapis.com/fcm/send/a' }),
        makeRecord({ id: 'sub-2', endpoint: 'https://fcm.googleapis.com/fcm/send/b' }),
      ];
      (repository.findByUserId as ReturnType<typeof vi.fn>).mockResolvedValue(records);

      await service.sendToUser('u-1', payload);

      expect(repository.findByUserId).toHaveBeenCalledWith('u-1');
      expect(adapter.sendNotification).toHaveBeenCalledTimes(2);
      expect(adapter.sendNotification).toHaveBeenNthCalledWith(
        1,
        { endpoint: records[0]!.endpoint, keys: { p256dh: 'p256', auth: 'auth' } },
        JSON.stringify(payload),
        { TTL: 86400, urgency: 'high' }
      );
    });

    it('aggregates subscriptions across users with findForUsers', async () => {
      const { repository, adapter, service } = makeService();
      (repository.findForUsers as ReturnType<typeof vi.fn>).mockResolvedValue([makeRecord()]);

      await service.sendToUsers(['u-1', 'u-2'], payload);

      expect(repository.findForUsers).toHaveBeenCalledWith(['u-1', 'u-2']);
      expect(adapter.sendNotification).toHaveBeenCalledTimes(1);
    });

    it('does nothing for an empty user id list', async () => {
      const { repository, adapter, service } = makeService();
      await service.sendToUsers([], payload);
      expect(repository.findForUsers).not.toHaveBeenCalled();
      expect(adapter.sendNotification).not.toHaveBeenCalled();
    });

    it('drops subscriptions whose endpoint host is not on the allowlist', async () => {
      const { repository, adapter, service } = makeService();
      (repository.findByUserId as ReturnType<typeof vi.fn>).mockResolvedValue([
        makeRecord(),
        makeRecord({
          id: 'sub-2',
          endpoint: 'https://evil.example.com/hook',
        }),
      ]);

      await service.sendToUser('u-1', payload);

      expect(adapter.sendNotification).toHaveBeenCalledTimes(1);
      expect(adapter.sendNotification).toHaveBeenCalledWith(
        expect.objectContaining({ endpoint: 'https://fcm.googleapis.com/fcm/send/abc' }),
        expect.any(String),
        expect.any(Object)
      );
    });

    it('prunes a subscription when the push service returns 404/410', async () => {
      const { repository, adapter, service } = makeService();
      (repository.findByUserId as ReturnType<typeof vi.fn>).mockResolvedValue([makeRecord()]);
      (adapter.sendNotification as ReturnType<typeof vi.fn>).mockRejectedValue(
        Object.assign(new Error('gone'), { statusCode: 410 })
      );

      await service.sendToUser('u-1', payload);

      expect(repository.removeEndpoint).toHaveBeenCalledWith(
        'https://fcm.googleapis.com/fcm/send/abc'
      );
    });

    it('prunes on 404 as well as 410', async () => {
      const { repository, adapter, service } = makeService();
      (repository.findByUserId as ReturnType<typeof vi.fn>).mockResolvedValue([makeRecord()]);
      (adapter.sendNotification as ReturnType<typeof vi.fn>).mockRejectedValue(
        Object.assign(new Error('not found'), { statusCode: 404 })
      );

      await service.sendToUser('u-1', payload);

      expect(repository.removeEndpoint).toHaveBeenCalledWith(
        'https://fcm.googleapis.com/fcm/send/abc'
      );
    });

    it('logs (not throws) on other send failures and does not prune', async () => {
      const { repository, adapter, service } = makeService();
      (repository.findByUserId as ReturnType<typeof vi.fn>).mockResolvedValue([makeRecord()]);
      (adapter.sendNotification as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('network down')
      );

      await expect(service.sendToUser('u-1', payload)).resolves.toBeUndefined();
      expect(repository.removeEndpoint).not.toHaveBeenCalled();
    });

    it('still resolves when the repository read throws', async () => {
      const { repository, service } = makeService();
      (repository.findByUserId as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('db down'));

      await expect(service.sendToUser('u-1', payload)).resolves.toBeUndefined();
    });

    it('matches subdomain-prefixed allowlist entries', async () => {
      const { repository, adapter, service } = makeService({
        allowlist: ['.notify.windows.com'],
      });
      (repository.findByUserId as ReturnType<typeof vi.fn>).mockResolvedValue([
        makeRecord({ endpoint: 'https://app3.push.notify.windows.com/?token=1' }),
        makeRecord({ id: 'sub-2', endpoint: 'https://fcm.googleapis.com/fcm/send/c' }),
      ]);

      await service.sendToUser('u-1', payload);

      expect(adapter.sendNotification).toHaveBeenCalledTimes(1);
      expect(adapter.sendNotification).toHaveBeenCalledWith(
        expect.objectContaining({ endpoint: 'https://app3.push.notify.windows.com/?token=1' }),
        expect.any(String),
        expect.any(Object)
      );
    });

    it('fans out with bounded concurrency across many subscriptions', async () => {
      const { repository, adapter, service } = makeService({ maxConcurrency: 3 });
      const records = Array.from({ length: 25 }, (_, i) =>
        makeRecord({ id: `sub-${i}`, endpoint: `https://fcm.googleapis.com/fcm/send/${i}` })
      );
      (repository.findByUserId as ReturnType<typeof vi.fn>).mockResolvedValue(records);

      await service.sendToUser('u-1', payload);

      expect(adapter.sendNotification).toHaveBeenCalledTimes(25);
    });
  });

  describe('disabled mode', () => {
    it('is a no-op when VAPID keys are absent', async () => {
      const { repository, adapter, service } = makeService({ enabled: false });

      await service.sendToUser('u-1', payload);
      await service.sendToUsers(['u-1', 'u-2'], payload);

      expect(adapter.setVapidDetails).not.toHaveBeenCalled();
      expect(repository.findByUserId).not.toHaveBeenCalled();
      expect(repository.findForUsers).not.toHaveBeenCalled();
      expect(adapter.sendNotification).not.toHaveBeenCalled();
    });
  });
});
