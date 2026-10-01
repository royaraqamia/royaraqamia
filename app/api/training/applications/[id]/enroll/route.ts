import { toNextResponse } from '@/backend/transport/http-result';
import { enrollTrainingApplication } from '@/backend/controllers/training';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  return toNextResponse(await enrollTrainingApplication(id, body));
}
