export interface PushSubscriptionRecord {
  id: string;
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PushSubscriptionUpsertInput {
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent: string | null;
}

export interface PushSubscriptionRepository {
  upsert(userId: string, input: PushSubscriptionUpsertInput): Promise<void>;
  findByUserId(userId: string): Promise<PushSubscriptionRecord[]>;
  findForUsers(userIds: string[]): Promise<PushSubscriptionRecord[]>;
  removeByEndpoint(userId: string, endpoint: string): Promise<void>;
  removeEndpoint(endpoint: string): Promise<void>;
}
