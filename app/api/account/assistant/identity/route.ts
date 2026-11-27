import { NextRequest } from 'next/server';

import {
  readAssistantIdentity,
  resetAssistantIdentity,
  saveAssistantIdentity,
} from '@/backend/controllers/assistant-identity';
import { toNextResponse } from '@/backend/transport/http-result';

/**
 * `GET /api/account/assistant/identity`: the member's own assistant identity
 * (ADR-0224).
 *
 * `PUT` replaces it with the four fields the page holds; `DELETE` deletes the
 * row and answers the deployment's default. All three answer `no-store`: a name
 * belongs to one member.
 */
export async function GET() {
  return toNextResponse(await readAssistantIdentity());
}

export async function PUT(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  return toNextResponse(await saveAssistantIdentity(body, req.headers));
}

export async function DELETE(req: NextRequest) {
  return toNextResponse(await resetAssistantIdentity(req.headers));
}
