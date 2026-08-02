import { NextResponse } from 'next/server';
import { getAuthUser } from '@/backend/middleware/auth-guard';
import { createSupabaseNotificationService } from '@/backend/config/notifications';

export async function GET() {
  try {
    const { user, supabase } = await getAuthUser();
    if (!user) return NextResponse.json({ notifications: [] });
    const service = createSupabaseNotificationService(supabase);
    const notifications = await service.getNotifications(user.id);
    return NextResponse.json({ notifications });
  } catch {
    return NextResponse.json({ notifications: [] });
  }
}

export async function PATCH() {
  try {
    const { user, supabase } = await getAuthUser();
    if (!user) return NextResponse.json({ success: true });
    const service = createSupabaseNotificationService(supabase);
    await service.markAllAsRead(user.id);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'فشل تحديث الإشعارات' }, { status: 500 });
  }
}
