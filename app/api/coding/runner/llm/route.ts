import { NextRequest } from 'next/server';

import { llmForRunner } from '@/backend/controllers/coding';
import { jsonResult, toNextResponse } from '@/backend/transport/http-result';
import { CodingRunnerLlmRequestSchema } from '@/shared/contracts/coding-agent';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * The model name, base URL and key come from the deployment, never from the
 * runner's body: the schema is strict and the control plane owns the key.
 */
export async function POST(req: NextRequest) {
  const parsed = CodingRunnerLlmRequestSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return toNextResponse(jsonResult(400, { success: false, error: 'طلب غير صالح' }));
  }
  return toNextResponse(await llmForRunner(req.headers, parsed.data));
}
