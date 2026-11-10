import { NextRequest } from 'next/server';

import {
  disconnectMcpConnection,
  getMcpConnection,
  updateMcpConnection,
} from '@/backend/controllers/mcp-marketplace';
import { toNextResponse } from '@/backend/transport/http-result';

export const runtime = 'nodejs';

/**
 * One connection: the post-connect screen's read, its three switches, and the
 * disconnect (ADR-0155, phase 3 / #1224).
 *
 * An id the member does not hold is a 404 from the controller, not an empty
 * answer: the screen shows its own "this app is not connected" state.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return toNextResponse(await getMcpConnection(id));
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return toNextResponse(await updateMcpConnection(id, req.headers, await req.text()));
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return toNextResponse(await disconnectMcpConnection(id, req.headers));
}
