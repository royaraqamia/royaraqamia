import { toNextResponse } from '@/backend/transport/http-result';
import { listConsultationPackages } from '@/backend/controllers/consultation';

export async function GET() {
  return toNextResponse(await listConsultationPackages());
}
