import { describe, expect, it } from 'vitest';

import {
  chatAttachmentObjectName,
  isChatAttachmentTooLarge,
} from '@/frontend/transport/supabase/chat-attachments';
import { CHAT_ATTACHMENT_MAX_BYTES } from '@/shared/contracts/chat';

const sized = (size: number) => ({ size }) as File;

describe('isChatAttachmentTooLarge', () => {
  it('accepts exactly 25 MB and refuses one byte more', () => {
    expect(isChatAttachmentTooLarge(sized(CHAT_ATTACHMENT_MAX_BYTES))).toBe(false);
    expect(isChatAttachmentTooLarge(sized(CHAT_ATTACHMENT_MAX_BYTES + 1))).toBe(true);
  });
});

describe('chatAttachmentObjectName', () => {
  it('flattens a name so it stays one path segment', () => {
    expect(chatAttachmentObjectName('folder/report.pdf')).toBe('folder-report.pdf');
    expect(chatAttachmentObjectName('..\\escape.pdf')).toBe('..-escape.pdf');
  });

  it('drops control characters and caps the length the table allows', () => {
    expect(chatAttachmentObjectName('re\u0000port\u001f.pdf')).toBe('report.pdf');
    expect(chatAttachmentObjectName(`${'a'.repeat(300)}.pdf`)).toHaveLength(200);
  });

  it('falls back to a name when the file has none', () => {
    expect(chatAttachmentObjectName('   ')).toBe('file');
  });
});
