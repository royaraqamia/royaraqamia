import { describe, expect, it } from 'vitest';

import {
  ATTACHMENT_REFUSALS,
  exceedsImageLimit,
  stageFiles,
} from '@/frontend/ui/chats/attachment-quota';
import type { ChatAttachmentQuota } from '@/shared/contracts/chat';

const QUOTA: ChatAttachmentQuota = {
  fileBytes: 10 * 1024 * 1024,
  today: { usedBytes: 0, limitBytes: 100 * 1024 * 1024 },
  total: { usedBytes: 0, limitBytes: 200 * 1024 * 1024 },
  project: { usedBytes: 0, limitBytes: 500 * 1024 * 1024 },
};

function file(name: string, type: string, bytes = 1_024): File {
  return new File([new Uint8Array(bytes)], name, { type });
}

const shot = (index: number) => file(`shot-${index}.webp`, 'image/webp');
const notes = (index: number) => file(`notes-${index}.txt`, 'text/plain');

/**
 * A picture is a prompt the model re-reads on every round, so a turn carries at
 * most three (ADR-0139). The count is made before the upload, so a fourth
 * picture costs nothing, and the contract refuses the same count again on the
 * server for a client that skipped this.
 */
describe('exceedsImageLimit', () => {
  it('lets three pictures through and refuses a fourth', () => {
    expect(exceedsImageLimit([], [shot(1), shot(2), shot(3)])).toBe(false);
    expect(exceedsImageLimit([], [shot(1), shot(2), shot(3), shot(4)])).toBe(true);
  });

  it('counts the pictures already staged', () => {
    expect(exceedsImageLimit([shot(1), shot(2)], [shot(3)])).toBe(false);
    expect(exceedsImageLimit([shot(1), shot(2)], [shot(3), shot(4)])).toBe(true);
  });

  it('counts pictures, not files: text files and a PDF are free', () => {
    expect(
      exceedsImageLimit(
        [],
        [shot(1), shot(2), shot(3), notes(1), notes(2), file('a.pdf', 'application/pdf')]
      )
    ).toBe(false);
  });

  /**
   * SVG is an image by MIME and a script by behaviour, so the contract treats it
   * as a file (ADR-0113) — it neither draws nor takes a picture's slot.
   */
  it('does not count an SVG, which is a file here', () => {
    expect(exceedsImageLimit([], [file('logo.svg', 'image/svg+xml')])).toBe(false);
  });
});

describe('stageFiles', () => {
  it('stages a pick inside every ceiling', () => {
    const staged = stageFiles([], [shot(1), notes(1)], QUOTA);
    expect('files' in staged && staged.files).toHaveLength(2);
  });

  it('refuses a file above the member’s per-file ceiling', () => {
    const big = file('huge.webp', 'image/webp', QUOTA.fileBytes + 1);
    expect(stageFiles([], [big], QUOTA)).toEqual({
      refusal: ATTACHMENT_REFUSALS.tooLarge(QUOTA.fileBytes),
    });
  });
});
