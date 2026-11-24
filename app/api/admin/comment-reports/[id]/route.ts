import { toNextResponse } from '@/backend/transport/http-result';
import { decideCommentReport } from '@/backend/controllers/comment-reports-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body: unknown = await request.json().catch(() => null);
  return toNextResponse(await decideCommentReport(id, body));
}
