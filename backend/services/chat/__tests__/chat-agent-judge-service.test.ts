import { describe, expect, it, vi } from 'vitest';

import type { AiChatClient } from '@/backend/clients/ai-chat';
import { createChatAgentJudge } from '@/backend/services/chat/chat-agent-judge-service';
import { FAILURE_SENTENCES } from '@/shared/contracts/chat-agent-failures.mjs';
import { buildJudgePrompt, expectedLanguage } from '@/shared/contracts/nour-quality.mjs';

const SCORES = {
  naturalness: 4,
  warmth: 4,
  helpfulness: 4,
  conciseness: 4,
  boundaries: 4,
};

function client(answers: string[]): AiChatClient {
  const queue = [...answers];
  return {
    model: 'test',
    reply: vi.fn(async () => {
      const next = queue.shift();
      if (!next) throw new Error('no scripted judge answer');
      return next;
    }),
    streamReply: async function* () {},
    streamWithTools: async function* () {},
    transcribe: async () => null,
  };
}

function verdict(scores: Record<string, number>, critique = ''): string {
  return JSON.stringify({ scores, reason: 'measured', critique });
}

function review(opts: {
  judgeAnswers: string[];
  rewrite?: string;
  draft?: string;
  question?: string;
}) {
  const writer = client(opts.rewrite ? [opts.rewrite] : []);
  const judge = client(opts.judgeAnswers);
  const service = createChatAgentJudge(judge);
  return {
    writer,
    judge,
    result: service.review({
      question: opts.question ?? 'سؤالي',
      draft: opts.draft ?? 'جواب واضح ومفيد.',
      trace: [{ tool: 'search_web', ok: true }],
      writer,
      signal: AbortSignal.timeout(5_000),
    }),
  };
}

describe('chat agent judge', () => {
  it('reveals a draft that clears the bar without a rewrite', async () => {
    const { result, writer } = review({ judgeAnswers: [verdict(SCORES)] });
    const out = await result;

    expect(out.text).toBe('جواب واضح ومفيد.');
    expect(out.judged).toBe(true);
    expect(out.rewritten).toBe(false);
    expect(writer.reply).not.toHaveBeenCalled();
  });

  it('asks the same writer for one rewrite and reveals it when it clears the bar', async () => {
    const low = { ...SCORES, warmth: 2 };
    const { result, writer } = review({
      judgeAnswers: [verdict(low, 'اجعلي الرد أشد دفئاً.'), verdict(SCORES)],
      rewrite: 'أهلاً بك، هذا جواب أوضح وأقرب.',
    });
    const out = await result;

    expect(out.rewritten).toBe(true);
    expect(out.text).toBe('أهلاً بك، هذا جواب أوضح وأقرب.');
    expect(writer.reply).toHaveBeenCalledTimes(1);
    expect(out.rewrittenVerdict?.ok).toBe(true);
  });

  it('never sends a draft with a deterministic failure to the judge', async () => {
    const { result, judge } = review({
      judgeAnswers: [],
      draft: 'الرقم \u0661\u0662\u0663',
    });
    const out = await result;

    expect(out.text).toBe(FAILURE_SENTENCES.provider);
    expect(out.fallback).toBe(true);
    expect(judge.reply).not.toHaveBeenCalled();
  });

  it('fails open to the gated draft when the judge cannot answer', async () => {
    const judge = client([]);
    const writer = client([]);
    const out = await createChatAgentJudge(judge).review({
      question: 'سؤالي',
      draft: 'جواب واضح ومفيد.',
      trace: [],
      writer,
      signal: AbortSignal.timeout(5_000),
    });

    expect(out.text).toBe('جواب واضح ومفيد.');
    expect(out.judged).toBe(false);
    expect(out.gates.pass).toBe(true);
  });

  it('keeps the draft when the rewrite scores no better', async () => {
    const low = { ...SCORES, warmth: 2 };
    const { result } = review({
      judgeAnswers: [verdict(low, 'دفء أكبر.'), verdict(low)],
      rewrite: 'جواب مختلف لكنه بارد أيضاً.',
    });
    const out = await result;

    expect(out.rewritten).toBe(true);
    expect(out.text).toBe('جواب واضح ومفيد.');
  });

  it('keeps the gated draft when the rewrite introduces a banned digit', async () => {
    const low = { ...SCORES, warmth: 2 };
    const { result } = review({
      judgeAnswers: [verdict(low, 'أصلح النص.')],
      rewrite: 'الرقم \u0661\u0662\u0663',
    });
    const out = await result;

    expect(out.text).toBe('جواب واضح ومفيد.');
    expect(out.fallback).toBe(false);
    expect(out.rewrittenGates?.pass).toBe(false);
  });

  it('leaves a bare message ungated instead of guessing its language', () => {
    expect(expectedLanguage('ok')).toBe('mixed');
    expect(expectedLanguage('?')).toBe('mixed');
    expect(expectedLanguage('شكراً')).toBe('ar');
    expect(expectedLanguage('What time?')).toBe('en');
  });

  it('shows only tool names and outcomes to the judge, never a payload', () => {
    const prompt = buildJudgePrompt({
      userMessage: 'سؤالي',
      reply: 'جواب',
      trace: [{ tool: 'spendtrack.list_transactions', ok: true }],
    });
    expect(prompt).toContain('spendtrack.list_transactions');
    expect(prompt).not.toContain('payload');
  });
});
