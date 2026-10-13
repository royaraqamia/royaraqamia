import type { PushPayload } from '@/shared/contracts/push';

/**
 * Delivery contract shared by the Web Push and FCM services, and the shape the
 * notification producers call. Both implementations are fail-soft: they log and
 * return rather than throwing, so one transport cannot break the other.
 */
export interface PushSender {
  sendToUser(userId: string, payload: PushPayload): Promise<void>;
  sendToUsers(userIds: string[], payload: PushPayload): Promise<void>;
}

/**
 * One payload, every transport. A user may be reachable on a desktop browser
 * (VAPID subscription) and on the Android shell (FCM token) at the same time,
 * and neither channel knows about the other, so producers talk to this fan-out
 * instead of picking a transport.
 */
export class PushFanout implements PushSender {
  constructor(private readonly channels: PushSender[]) {}

  async sendToUser(userId: string, payload: PushPayload): Promise<void> {
    await Promise.all(this.channels.map((channel) => channel.sendToUser(userId, payload)));
  }

  async sendToUsers(userIds: string[], payload: PushPayload): Promise<void> {
    await Promise.all(this.channels.map((channel) => channel.sendToUsers(userIds, payload)));
  }
}
