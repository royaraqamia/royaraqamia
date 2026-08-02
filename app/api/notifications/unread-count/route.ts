import { NextResponse } from 'next/server';
import { getAuthUser } from '@/backend/middleware/auth-guard';
import { createSupabaseNotificationService } from '@/backend/config/notifications';

export async function GET() {
  try {
    const { user, supabase } = await getAuthUser();
    if (!user) return NextResponse.json({ count: 0 });
    const service = createSupabaseNotificationService(supabase);
    const count = await service.getUnreadCount(user.id);
    return NextResponse.json({ count });
  } catch {
    return NextResponse.json({ count: 0 });
  }
}
