import { NextRequest } from 'next/server';
import { toNextResponse } from '@/backend/transport/http-result';
import { createTrainingCohort, listTrainingCohorts } from '@/backend/controllers/training-cohorts';

export async function GET() {
  return toNextResponse(await listTrainingCohorts());
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  return toNextResponse(await createTrainingCohort(body));
}
