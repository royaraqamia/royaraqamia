import { type NextRequest } from 'next/server';

import { listChatReports } from '@/backend/controllers/chat-reports-admin';
import { toNextResponse } from '@/backend/transport/http-result';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  return toNextResponse(await listChatReports({ status: searchParams.get('status') }));
}
