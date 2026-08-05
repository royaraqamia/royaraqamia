import { request } from '@/frontend/transport/http';

export interface AnnouncementResult {
  success: boolean;
  sent?: number;
  error?: string;
}

export async function broadcastAnnouncement(
  title: string,
  body: string
): Promise<AnnouncementResult> {
  try {
    return await request<AnnouncementResult>('/api/admin/announcements', {
      method: 'POST',
      body: JSON.stringify({ title, body }),
    });
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'فشل إرسال الإعلان',
    };
  }
}
