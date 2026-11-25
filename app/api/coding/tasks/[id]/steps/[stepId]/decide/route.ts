import { NextRequest } from 'next/server';

import { decideCodingStep } from '@/backend/controllers/coding';
import { isSameOrigin } from '@/backend/transport/http';
import { jsonResult, toNextResponse } from '@/backend/transport/http-result';
import { DecideCodingStepSchema } from '@/shared/contracts/coding-agent';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; stepId: string }> }
) {
  if (!isSameOrigin(req.headers)) {
    return toNextResponse(jsonResult(403, { success: false, error: 'طلب غير مسموح' }));
  }
  const parsed = DecideCodingStepSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return toNextResponse(jsonResult(400, { success: false, error: 'طلب غير صالح' }));
  }
  const { id, stepId } = await params;
  return toNextResponse(await decideCodingStep(req.headers, id, stepId, parsed.data));
}
