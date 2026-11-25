import { NextRequest } from 'next/server';

import { createCodingTask, listCodingTasks } from '@/backend/controllers/coding';
import { isSameOrigin } from '@/backend/transport/http';
import { jsonResult, toNextResponse } from '@/backend/transport/http-result';
import { CodingTaskListQuerySchema, CreateCodingTaskSchema } from '@/shared/contracts/coding-agent';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const parsed = CodingTaskListQuerySchema.safeParse(
    Object.fromEntries(req.nextUrl.searchParams.entries())
  );
  if (!parsed.success) {
    return toNextResponse(jsonResult(400, { success: false, error: 'طلب غير صالح' }));
  }
  return toNextResponse(await listCodingTasks(req.headers, parsed.data));
}

export async function POST(req: NextRequest) {
  if (!isSameOrigin(req.headers)) {
    return toNextResponse(jsonResult(403, { success: false, error: 'طلب غير مسموح' }));
  }
  const parsed = CreateCodingTaskSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return toNextResponse(jsonResult(400, { success: false, error: 'طلب غير صالح' }));
  }
  return toNextResponse(await createCodingTask(req.headers, parsed.data));
}
