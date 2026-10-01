import { toNextResponse } from '@/backend/transport/http-result';
import { listOpenTrainingCohorts } from '@/backend/controllers/training-cohorts';

/** Public: open cohorts a student may ask for. Advisory seat counts only. */
export async function GET() {
  return toNextResponse(await listOpenTrainingCohorts());
}
