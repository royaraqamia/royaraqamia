import { NextRequest } from 'next/server';

import { editAgentMemory, forgetAgentMemory } from '@/backend/controllers/account-memory';
import { toNextResponse } from '@/backend/transport/http-result';

/**
 * One fact (ADR-0182 decision 6, #1428): `PATCH` edits its text or kind,
 * `DELETE` forgets it — the row and its vector in one transaction.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  return toNextResponse(await editAgentMemory(id, body, req.headers));
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return toNextResponse(await forgetAgentMemory(id, req.headers));
}
