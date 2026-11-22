import type {
  DevicePushTokenRepository,
  DevicePushTokenUpsertInput,
} from '@/backend/repositories/push/device-push-tokens-repository';

export interface PushDeviceServiceOptions {
  repository: DevicePushTokenRepository;
}

/**
 * The write side of native push registration. `FcmPushService` reads and prunes
 * tokens at send time; this service owns the two writes a device makes, so the
 * HTTP controller never has to reach the data layer itself.
 */
export class PushDeviceService {
  private readonly repository: DevicePushTokenRepository;

  constructor(options: PushDeviceServiceOptions) {
    this.repository = options.repository;
  }

  async register(userId: string, input: DevicePushTokenUpsertInput): Promise<void> {
    await this.repository.upsert(userId, input);
  }

  /** Caller-scoped when given a session client: RLS is the owner guarantee. */
  async unregister(userId: string, token: string): Promise<void> {
    await this.repository.removeByToken(userId, token);
  }
}
