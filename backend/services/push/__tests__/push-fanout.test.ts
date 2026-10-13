import { describe, it, expect, vi } from 'vitest';
import { PushFanout, type PushSender } from '@/backend/services/push/push-fanout';
import type { PushPayload } from '@/shared/contracts/push';

const payload: PushPayload = { title: 'عنوان', type: 'system_announcement' };

function makeChannel(): PushSender {
  return {
    sendToUser: vi.fn(async () => undefined),
    sendToUsers: vi.fn(async () => undefined),
  };
}

describe('PushFanout', () => {
  it('sends to every transport for a single user', async () => {
    const web = makeChannel();
    const fcm = makeChannel();
    const fanout = new PushFanout([web, fcm]);

    await fanout.sendToUser('u-1', payload);

    expect(web.sendToUser).toHaveBeenCalledWith('u-1', payload);
    expect(fcm.sendToUser).toHaveBeenCalledWith('u-1', payload);
  });

  it('sends to every transport for a batch of users', async () => {
    const web = makeChannel();
    const fcm = makeChannel();
    const fanout = new PushFanout([web, fcm]);

    await fanout.sendToUsers(['u-1', 'u-2'], payload);

    expect(web.sendToUsers).toHaveBeenCalledWith(['u-1', 'u-2'], payload);
    expect(fcm.sendToUsers).toHaveBeenCalledWith(['u-1', 'u-2'], payload);
  });

  it('awaits both transports before resolving', async () => {
    const order: string[] = [];
    const slow: PushSender = {
      sendToUser: vi.fn(async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        order.push('slow');
      }),
      sendToUsers: vi.fn(async () => undefined),
    };
    const fast: PushSender = {
      sendToUser: vi.fn(async () => {
        order.push('fast');
      }),
      sendToUsers: vi.fn(async () => undefined),
    };

    await new PushFanout([slow, fast]).sendToUser('u-1', payload);

    expect(order).toHaveLength(2);
  });

  it('is a no-op with no channels', async () => {
    await expect(new PushFanout([]).sendToUsers(['u-1'], payload)).resolves.toBeUndefined();
  });
});
