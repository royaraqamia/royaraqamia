import { toNextResponse } from '@/backend/transport/http-result';
import { listCommentReports } from '@/backend/controllers/comment-reports-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const status = new URL(request.url).searchParams.get('status');
  return toNextResponse(await listCommentReports({ status }));
}
