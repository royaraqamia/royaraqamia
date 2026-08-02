import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/backend/middleware/auth-guard';
import { createSupabaseNotificationService } from '@/backend/config/notifications';

export async function PATCH(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const { user, supabase } = await getAuthUser();
    if (!user) return NextResponse.json({ success: true });
    const service = createSupabaseNotificationService(supabase);
    await service.markAsRead(id, user.id);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'فشل تحديث الإشعار' }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const { user, supabase } = await getAuthUser();
    if (!user) return NextResponse.json({ success: true });
    const service = createSupabaseNotificationService(supabase);
    await service.delete(id, user.id);
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'فشل حذف الإشعار' }, { status: 500 });
  }
}
