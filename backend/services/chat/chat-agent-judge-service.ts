import type { AiChatClient } from '@/backend/clients/ai-chat';
import { logger } from '@/backend/shared/logger';
import { FAILURE_SENTENCES } from '@/shared/contracts/chat-agent-failures.mjs';
import {
  buildJudgePrompt,
  buildRewriteMessages,
  expectedLanguage,
  liveGates,
  parseJudgeVerdict,
  verdictPasses,
} from '@/shared/contracts/nour-quality.mjs';

/**
 * The second model's whole job (ADR-0213): score a finished draft and, when it
 * fails, hand a short private critique to the writer for one rewrite. It never
 * writes member-facing text, calls a tool, or grants a capability.
 *
 * The judge is deliberately off the request's critical path in only one sense:
 * it is awaited before reveal, because the member must never see the first
 * draft. A judge that is down, slow, or silent degrades to the deterministic
 * gates — it never turns a failed turn into a broken one.
 */

export interface JudgeTraceItem {
  tool: string;
  ok?: boolean;
  proposed?: boolean;
}

interface Verdict {
  ok: boolean;
  scores: Record<string, number | null>;
  reason: string;
  critique: string;
}

interface GateResult {
  pass: boolean;
  failures: string[];
  warnings: string[];
}

/** Everything the review log needs, and nothing the member ever sees. */
export interface DraftReview {
  /** The text that may be revealed. */
  text: string;
  /** The draft before any rewrite, kept for the training log. */
  draft: string;
  gates: GateResult;
  verdict: Verdict | null;
  judged: boolean;
  rewritten: boolean;
  rewrite: string | null;
  rewrittenGates: GateResult | null;
  rewrittenVerdict: Verdict | null;
  /** True when no generated answer cleared the gates and the fallback was used. */
  fallback: boolean;
}

export interface ChatAgentJudge {
  review(input: {
    question: string;
    draft: string;
    trace: readonly JudgeTraceItem[];
    writer: AiChatClient;
    signal: AbortSignal;
  }): Promise<DraftReview>;
}

function mean(scores: Record<string, number | null>): number {
  const values = Object.values(scores).filter((value): value is number => value !== null);
  return values.length === 0
    ? 0
    : values.reduce((total, value) => total + value, 0) / values.length;
}

function askJudge(client: AiChatClient, prompt: string, signal: AbortSignal): Promise<Verdict> {
  return client
    .reply(
      [
        {
          role: 'system',
          content:
            'You are a strict evaluation judge. Output JSON only, no prose, no markdown fences.',
        },
        { role: 'user', content: prompt },
      ],
      signal,
      { responseFormat: { type: 'json_object' } }
    )
    .then((text) => parseJudgeVerdict(text) as Verdict);
}

export function createChatAgentJudge(judgeClient: AiChatClient | null): ChatAgentJudge {
  return {
    async review({ question, draft, trace, writer, signal }) {
      const language = expectedLanguage(question);
      const gates = liveGates(draft, { language }) as GateResult;
      const unreviewed: DraftReview = {
        text: draft,
        draft,
        gates,
        verdict: null,
        judged: false,
        rewritten: false,
        rewrite: null,
        rewrittenGates: null,
        rewrittenVerdict: null,
        fallback: false,
      };

      // `off` is the documented way back to the pre-gate turn: no judge, no
      // gates, no rewrite. A judge that exists but fails still honours the gates.
      if (!judgeClient) return unreviewed;
      if (!gates.pass) {
        return { ...unreviewed, text: FAILURE_SENTENCES.provider, fallback: true };
      }

      let verdict: Verdict;
      try {
        verdict = await askJudge(
          judgeClient,
          buildJudgePrompt({ userMessage: question, reply: draft, trace: [...trace] }),
          signal
        );
      } catch (error) {
        logger.warn('Assistant judge could not score a draft', { error: String(error) });
        return unreviewed;
      }

      const reviewed: DraftReview = { ...unreviewed, judged: true, verdict };
      if (verdictPasses(verdict, gates)) return reviewed;

      const critique = verdict.critique || verdict.reason;
      if (!critique) return reviewed;

      try {
        const rewrite = (
          await writer.reply(buildRewriteMessages({ question, draft, critique }), signal)
        ).trim();
        if (!rewrite) return reviewed;

        const rewrittenGates = liveGates(rewrite, { language }) as GateResult;
        let rewrittenVerdict: Verdict | null = null;
        if (rewrittenGates.pass) {
          try {
            rewrittenVerdict = await askJudge(
              judgeClient,
              buildJudgePrompt({ userMessage: question, reply: rewrite, trace: [...trace] }),
              signal
            );
          } catch (error) {
            logger.warn('Assistant judge could not score a rewrite', { error: String(error) });
          }
        }

        const rewriteClears =
          rewrittenGates.pass &&
          rewrittenVerdict !== null &&
          verdictPasses(rewrittenVerdict, rewrittenGates);
        const rewriteBetter =
          rewriteClears &&
          rewrittenVerdict !== null &&
          mean(rewrittenVerdict.scores) > mean(verdict.scores);

        if (rewriteBetter) {
          return {
            ...reviewed,
            text: rewrite,
            rewritten: true,
            rewrite,
            rewrittenGates,
            rewrittenVerdict,
          };
        }
        return { ...reviewed, rewritten: true, rewrite, rewrittenGates, rewrittenVerdict };
      } catch (error) {
        // The rewrite is a quality step, never a reason to lose a turn. The
        // draft already cleared the deterministic gates, so it is safe to show.
        logger.warn('Assistant rewrite failed', { error: String(error) });
        return reviewed;
      }
    },
  };
}
