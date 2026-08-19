import { request } from '@/frontend/transport/http';

export interface BroadcastChannels {
  notification?: boolean;
  email?: boolean;
}

export interface BroadcastResult {
  success: boolean;
  sent?: number;
  emailsSent?: number;
  error?: string;
}

export async function broadcastMessage(
  title: string,
  body: string,
  userIds: string[],
  channels: BroadcastChannels = {}
): Promise<BroadcastResult> {
  try {
    return await request<BroadcastResult>('/api/admin/broadcast', {
      method: 'POST',
      body: JSON.stringify({ title, body, userIds, channels }),
    });
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'فشل إرسال الرسالة',
    };
  }
}
