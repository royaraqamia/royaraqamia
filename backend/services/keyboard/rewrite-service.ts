import { KEYBOARD_REWRITE_COPY } from '@/backend/copy/keyboard-rewrite';
import { MAX_REWRITE_OUTPUT_CHARS, REWRITE_TIMEOUT_MS } from '@/shared/contracts/keyboard-rewrite';

/**
 * One rewrite, one provider call, no conversation (ADR-0220 decision 6).
 *
 * The service holds no tools, no memory and no agent loop: it hands the gateway
 * two messages and a deadline, and either gets one short string back or throws.
 * The output ceiling is checked here, outside the model, so a verbose answer is
 * a failure rather than a truncated half-sentence in a text field.
 */
export type RewriteMessage = { role: 'system' | 'user'; content: string };

export type RewriteReply = (messages: RewriteMessage[], signal: AbortSignal) => Promise<string>;

export class KeyboardRewriteFailed extends Error {
  constructor() {
    super(KEYBOARD_REWRITE_COPY.failure);
    this.name = 'KeyboardRewriteFailed';
  }
}

const SYSTEM_PROMPT = [
  'أعد صياغة النص العربي التالي بأسلوب أوضح وأسهل قراءة.',
  'أعد النص المُعاد صياغة فقط، في سطر واحد، من غير شرح ولا عناوين ولا اقتباس.',
  'لا تستخدم أدوات ولا تتذكر شيئًا من محادثات سابقة.',
].join(' ');

export class KeyboardRewriteService {
  constructor(private readonly reply: RewriteReply) {}

  async rewrite(text: string): Promise<string> {
    let answer: string;
    try {
      answer = await this.reply(
        [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: text },
        ],
        AbortSignal.timeout(REWRITE_TIMEOUT_MS)
      );
    } catch {
      throw new KeyboardRewriteFailed();
    }

    const oneLine = answer
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean);
    if (!oneLine || oneLine.length > MAX_REWRITE_OUTPUT_CHARS) {
      throw new KeyboardRewriteFailed();
    }
    return oneLine;
  }
}
