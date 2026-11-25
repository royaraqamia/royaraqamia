import { beforeEach, describe, expect, it, vi } from 'vitest';

import { KEYBOARD_REWRITE_COPY } from '@/backend/copy/keyboard-rewrite';
import {
  KeyboardRewriteFailed,
  KeyboardRewriteService,
} from '@/backend/services/keyboard/rewrite-service';
import { MAX_REWRITE_OUTPUT_CHARS, REWRITE_TIMEOUT_MS } from '@/shared/contracts/keyboard-rewrite';

describe('KeyboardRewriteService', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('makes one call with only the two messages and a bounded deadline', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout');
    const reply = vi.fn().mockResolvedValue('نص أوضح وأسهل.');
    const service = new KeyboardRewriteService(reply);

    expect(await service.rewrite('النص الأصلي')).toBe('نص أوضح وأسهل.');
    expect(reply).toHaveBeenCalledTimes(1);
    const [messages, signal] = reply.mock.calls[0] as [
      Array<{ role: string; content: string }>,
      AbortSignal,
    ];
    expect(messages).toHaveLength(2);
    expect(messages[1]).toEqual({ role: 'user', content: 'النص الأصلي' });
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(timeout).toHaveBeenCalledWith(REWRITE_TIMEOUT_MS);
    expect(timeout.mock.results[0]?.value).toBe(signal);
  });

  it('returns one line and refuses an answer past the output cap', async () => {
    const service = new KeyboardRewriteService(
      vi.fn().mockResolvedValue(`أول سطر\n${'خ'.repeat(MAX_REWRITE_OUTPUT_CHARS)}`)
    );
    expect(await service.rewrite('نص')).toBe('أول سطر');

    const verbose = new KeyboardRewriteService(
      vi.fn().mockResolvedValue('خ'.repeat(MAX_REWRITE_OUTPUT_CHARS + 1))
    );
    await expect(verbose.rewrite('نص')).rejects.toThrow(KeyboardRewriteFailed);
    await expect(verbose.rewrite('نص')).rejects.toThrow(KEYBOARD_REWRITE_COPY.failure);
  });

  it('treats a provider failure or an empty answer as a failure sentence', async () => {
    const failed = new KeyboardRewriteService(vi.fn().mockRejectedValue(new Error('provider 500')));
    const empty = new KeyboardRewriteService(vi.fn().mockResolvedValue('   \n  '));

    await expect(failed.rewrite('نص')).rejects.toThrow(KEYBOARD_REWRITE_COPY.failure);
    await expect(empty.rewrite('نص')).rejects.toThrow(KEYBOARD_REWRITE_COPY.failure);
  });
});
