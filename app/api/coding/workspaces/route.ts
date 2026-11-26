import { NextRequest } from 'next/server';

import { addCodingWorkspace, listCodingWorkspaces } from '@/backend/controllers/coding';
import { isSameOrigin } from '@/backend/transport/http';
import { jsonResult, toNextResponse } from '@/backend/transport/http-result';
import { CreateCodingWorkspaceSchema } from '@/shared/contracts/coding-agent';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  return toNextResponse(await listCodingWorkspaces(req.headers));
}

export async function POST(req: NextRequest) {
  if (!isSameOrigin(req.headers)) {
    return toNextResponse(jsonResult(403, { success: false, error: 'طلب غير مسموح' }));
  }
  const parsed = CreateCodingWorkspaceSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return toNextResponse(jsonResult(400, { success: false, error: 'طلب غير صالح' }));
  }
  return toNextResponse(await addCodingWorkspace(req.headers, parsed.data));
}
