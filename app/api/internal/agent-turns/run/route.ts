import { NextRequest } from 'next/server';

import { runChatAgentTurns } from '@/backend/controllers/chat';
import { toNextResponse } from '@/backend/transport/http-result';

/**
 * The assistant's worker (ADR-0125), called by `wake_agent_turns()`'s pg_cron
 * doorbell with `CRON_SECRET`.
 *
 * Kept under `/api/internal` because nothing a member can click should reach it:
 * it finishes a turn that was abandoned, as the member, through a session minted
 * for that turn.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  return toNextResponse(await runChatAgentTurns(req.headers));
}
