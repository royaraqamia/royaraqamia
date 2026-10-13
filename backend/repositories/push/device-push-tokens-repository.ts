export interface DevicePushTokenRecord {
  id: string;
  userId: string;
  token: string;
  platform: string;
  userAgent: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DevicePushTokenUpsertInput {
  token: string;
  platform: string;
  userAgent: string | null;
}

/**
 * Registry of native push tokens (FCM registration ids) for the Capacitor
 * shell. There is no `touch`/sweep counterpart to the Web Push repository: FCM
 * reports a dead token at send time (`UNREGISTERED`), which is the prune signal
 * the dispatch path acts on, so nothing has to age out on a timer.
 */
export interface DevicePushTokenRepository {
  upsert(userId: string, input: DevicePushTokenUpsertInput): Promise<void>;
  findByUserId(userId: string): Promise<DevicePushTokenRecord[]>;
  findForUsers(userIds: string[]): Promise<DevicePushTokenRecord[]>;
  removeByToken(userId: string, token: string): Promise<void>;
  removeToken(token: string): Promise<void>;
}
