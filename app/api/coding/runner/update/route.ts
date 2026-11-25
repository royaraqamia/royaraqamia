import { NextRequest } from 'next/server';

import { updateRunnerTask } from '@/backend/controllers/coding';
import { jsonResult, toNextResponse } from '@/backend/transport/http-result';
import { CodingRunnerUpdateSchema } from '@/shared/contracts/coding-agent';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const parsed = CodingRunnerUpdateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return toNextResponse(jsonResult(400, { success: false, error: 'طلب غير صالح' }));
  }
  return toNextResponse(await updateRunnerTask(req.headers, parsed.data));
}
