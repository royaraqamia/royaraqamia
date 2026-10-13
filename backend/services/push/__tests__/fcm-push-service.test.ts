import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FcmPushService } from '@/backend/services/push/fcm-push-service';
import type {
  DevicePushTokenRecord,
  DevicePushTokenRepository,
} from '@/backend/repositories/push/device-push-tokens-repository';
import type { FcmAdapter, FcmSendError } from '@/backend/services/push/fcm-client';
import type { PushPayload } from '@/shared/contracts/push';

const { loggerWarn, loggerError } = vi.hoisted(() => ({
  loggerWarn: vi.fn(),
  loggerError: vi.fn(),
}));

vi.mock('@/backend/shared/logger', () => ({
  logger: { info: vi.fn(), warn: loggerWarn, error: loggerError, debug: vi.fn() },
}));

const payload: PushPayload = { title: 'شهادة جديدة', body: 'نص', type: 'certificate_issued' };

function makeRecord(overrides: Partial<DevicePushTokenRecord> = {}): DevicePushTokenRecord {
  return {
    id: 'token-1',
    userId: 'u-1',
    token: 'test-token',
    platform: 'android',
    userAgent: 'Android 14',
    createdAt: '2026-10-13T08:00:00.000Z',
    updatedAt: '2026-10-13T08:00:00.000Z',
    ...overrides,
  };
}

function fcmError(statusCode: number, errorCode: string): FcmSendError {
  const error = new Error(`FCM send failed (${statusCode} ${errorCode})`) as FcmSendError;
  error.statusCode = statusCode;
  error.errorCode = errorCode;
  return error;
}

function makeRepo() {
  const repository: DevicePushTokenRepository = {
    upsert: vi.fn(),
    findByUserId: vi.fn(async () => []),
    findForUsers: vi.fn(async () => []),
    removeByToken: vi.fn(),
    removeToken: vi.fn(async () => undefined),
  };
  return repository;
}

function makeService(
  overrides: {
    repository?: DevicePushTokenRepository;
    adapter?: FcmAdapter;
    enabled?: boolean;
    maxConcurrency?: number;
  } = {}
) {
  const repository = overrides.repository ?? makeRepo();
  const adapter: FcmAdapter = overrides.adapter ?? { send: vi.fn(async () => undefined) };
  const service = new FcmPushService({
    repository,
    enabled: overrides.enabled ?? true,
    adapter,
    maxConcurrency: overrides.maxConcurrency,
    retryDelayMs: 0,
  });
  return { repository, adapter, service };
}

describe('FcmPushService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('is a no-op when the service account is not configured', async () => {
    const { repository, adapter, service } = makeService({ enabled: false });
    (repository.findByUserId as ReturnType<typeof vi.fn>).mockResolvedValue([makeRecord()]);

    await service.sendToUser('u-1', payload);
    await service.sendToUsers(['u-1'], payload);

    expect(repository.findByUserId).not.toHaveBeenCalled();
    expect(adapter.send).not.toHaveBeenCalled();
  });

  it('sends the payload to every token the user registered', async () => {
    const { repository, adapter, service } = makeService();
    const records = [makeRecord(), makeRecord({ id: 'token-2', token: 'second-token' })];
    (repository.findByUserId as ReturnType<typeof vi.fn>).mockResolvedValue(records);

    await service.sendToUser('u-1', payload);

    expect(repository.findByUserId).toHaveBeenCalledWith('u-1');
    expect(adapter.send).toHaveBeenCalledTimes(2);
    expect(adapter.send).toHaveBeenNthCalledWith(1, 'test-token', payload);
    expect(adapter.send).toHaveBeenNthCalledWith(2, 'second-token', payload);
  });

  it('aggregates tokens across users with findForUsers', async () => {
    const { repository, adapter, service } = makeService();
    (repository.findForUsers as ReturnType<typeof vi.fn>).mockResolvedValue([makeRecord()]);

    await service.sendToUsers(['u-1', 'u-2'], payload);

    expect(repository.findForUsers).toHaveBeenCalledWith(['u-1', 'u-2']);
    expect(adapter.send).toHaveBeenCalledTimes(1);
  });

  it('does nothing for an empty user list', async () => {
    const { repository, service } = makeService();

    await service.sendToUsers([], payload);

    expect(repository.findForUsers).not.toHaveBeenCalled();
  });

  it('prunes a token FCM reports as unregistered', async () => {
    const { repository, adapter, service } = makeService();
    (repository.findByUserId as ReturnType<typeof vi.fn>).mockResolvedValue([makeRecord()]);
    (adapter.send as ReturnType<typeof vi.fn>).mockRejectedValue(fcmError(404, 'UNREGISTERED'));

    await service.sendToUser('u-1', payload);

    expect(repository.removeToken).toHaveBeenCalledWith('test-token');
    expect(loggerWarn).toHaveBeenCalledWith(
      'Pruning dead device push token',
      expect.objectContaining({ userId: 'u-1' })
    );
  });

  it('keeps a token FCM rejects for a reason other than death', async () => {
    const { repository, adapter, service } = makeService();
    (repository.findByUserId as ReturnType<typeof vi.fn>).mockResolvedValue([makeRecord()]);
    (adapter.send as ReturnType<typeof vi.fn>).mockRejectedValue(fcmError(400, 'INVALID_ARGUMENT'));

    await service.sendToUser('u-1', payload);

    expect(repository.removeToken).not.toHaveBeenCalled();
    expect(adapter.send).toHaveBeenCalledTimes(1);
  });

  it('retries a transient provider failure and stops once it succeeds', async () => {
    const { repository, adapter, service } = makeService();
    (repository.findByUserId as ReturnType<typeof vi.fn>).mockResolvedValue([makeRecord()]);
    (adapter.send as ReturnType<typeof vi.fn>)
      .mockRejectedValueOnce(fcmError(503, 'UNAVAILABLE'))
      .mockResolvedValueOnce(undefined);

    await service.sendToUser('u-1', payload);

    expect(adapter.send).toHaveBeenCalledTimes(2);
    expect(repository.removeToken).not.toHaveBeenCalled();
  });

  it('gives up after the attempt cap and leaves the token in place', async () => {
    const { repository, adapter, service } = makeService();
    (repository.findByUserId as ReturnType<typeof vi.fn>).mockResolvedValue([makeRecord()]);
    (adapter.send as ReturnType<typeof vi.fn>).mockRejectedValue(fcmError(500, 'INTERNAL'));

    await service.sendToUser('u-1', payload);

    expect(adapter.send).toHaveBeenCalledTimes(3);
    expect(repository.removeToken).not.toHaveBeenCalled();
    expect(loggerWarn).toHaveBeenCalledWith(
      'Failed to send native push notification',
      expect.objectContaining({ userId: 'u-1', attempt: 3 })
    );
  });

  it('never throws when the token lookup fails', async () => {
    const { repository, adapter, service } = makeService();
    (repository.findByUserId as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('db down'));

    await expect(service.sendToUser('u-1', payload)).resolves.toBeUndefined();
    expect(adapter.send).not.toHaveBeenCalled();
    expect(loggerError).toHaveBeenCalledWith(
      'Failed to dispatch native push notifications for user',
      expect.objectContaining({ userId: 'u-1' })
    );
  });

  it('survives a failed prune without failing the dispatch', async () => {
    const { repository, adapter, service } = makeService();
    (repository.findByUserId as ReturnType<typeof vi.fn>).mockResolvedValue([makeRecord()]);
    (adapter.send as ReturnType<typeof vi.fn>).mockRejectedValue(fcmError(404, 'UNREGISTERED'));
    (repository.removeToken as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('delete failed')
    );

    await expect(service.sendToUser('u-1', payload)).resolves.toBeUndefined();
    expect(loggerError).toHaveBeenCalledWith(
      'Failed to prune dead device push token',
      expect.objectContaining({ userId: 'u-1' })
    );
  });
});
