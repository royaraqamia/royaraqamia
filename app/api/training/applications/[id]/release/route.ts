import { toNextResponse } from '@/backend/transport/http-result';
import { releaseTrainingApplication } from '@/backend/controllers/training';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  return toNextResponse(await releaseTrainingApplication(id, body));
}
