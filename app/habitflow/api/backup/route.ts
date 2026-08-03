import { NextRequest } from 'next/server';
import { toNextResponse } from '@/backend/transport/http-result';
import { exportBackup, restoreBackup } from '@/backend/controllers/habitflow';

export async function GET() {
  return toNextResponse(await exportBackup());
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  return toNextResponse(await restoreBackup(body));
}
