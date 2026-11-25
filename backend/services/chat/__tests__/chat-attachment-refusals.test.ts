import { describe, expect, it } from 'vitest';

import {
  ATTACHMENT_REFUSALS,
  attachmentRefusalSentence,
} from '@/backend/services/chat/chat-service';
import copy from '@/shared/copy/chat-attachments.json';

/**
 * The server used to type its own sentences beside the trigger's raise texts.
 * One drifted — the too-large one lost both its size and its remedy — while
 * `check:copy` only diffed the site and the app. The words now come from the
 * generated server module; these assertions hold that seam in place (#1805).
 */
describe('attachment refusal copy', () => {
  it("gives every refusal exactly one sentence, and the sentence is the copy source's", () => {
    const seen = new Set<string>();
    for (const refusal of Object.values(ATTACHMENT_REFUSALS)) {
      expect(seen.has(refusal.key)).toBe(false);
      seen.add(refusal.key);
      expect(attachmentRefusalSentence(refusal.key)).toBe(
        copy.strings[refusal.key as keyof typeof copy.strings]
      );
    }
    // The five-per-message cap is a composer pre-check, never a trigger's raise.
    expect(seen.size).toBe(4);
    expect(seen.has('tooMany')).toBe(false);
  });

  it('fills the per-file placeholder with the number the server enforces', () => {
    expect(attachmentRefusalSentence('tooLarge', 8 * 1024 * 1024)).toBe(
      copy.strings.tooLarge.replace('{size}', '8.0 م.ب')
    );
  });

  it('keeps the database raise texts and their statuses', () => {
    expect(
      Object.fromEntries(
        Object.entries(ATTACHMENT_REFUSALS).map(([raise, refusal]) => [raise, refusal.status])
      )
    ).toEqual({
      'chat attachment file is too large': 413,
      'chat attachment daily allowance reached': 429,
      'chat attachment storage is full': 409,
      'chat attachment project storage is full': 409,
    });
  });
});
