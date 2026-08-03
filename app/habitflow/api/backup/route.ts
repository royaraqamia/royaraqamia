import { NextRequest } from 'next/server';
import { createHabitBackupService } from '@/backend/config/habitflow';
import { getOptionalUser } from '@/backend/middleware/auth-guard';
import { jsonOk, jsonError } from '@/backend/transport/http';

export async function GET(_req: NextRequest) {
  try {
    const { user, client } = await getOptionalUser();
    const { service } = createHabitBackupService(user?.id, client ?? undefined);
    const backup = await service.exportBackup();
    return jsonOk(backup);
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { user, client } = await getOptionalUser();
    const { service, mode } = createHabitBackupService(user?.id, client ?? undefined);
    const body = await req.json();
    await service.restoreBackup({ habits: body.habits, logs: body.logs });
    return jsonOk({ success: true, mode });
  } catch (error) {
    return jsonError(error);
  }
}
