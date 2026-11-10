import { describe, expect, it } from 'vitest';

import {
  chatAttachmentExtension,
  chatAttachmentFileName,
  chatAttachmentObjectPath,
  isChatAttachmentTooLarge,
} from '@/frontend/transport/supabase/chat-attachments';
import { CHAT_ATTACHMENT_MAX_BYTES } from '@/shared/contracts/chat';

const sized = (size: number) => ({ size }) as File;
/** The uuid folder is the upload's own; only its shape is the contract's. */
const shape = (path: string) => path.replace(/\/([0-9a-f-]{36})\//, '/<uuid>/');

describe('isChatAttachmentTooLarge', () => {
  it('accepts exactly 25 MB and refuses one byte more', () => {
    expect(isChatAttachmentTooLarge(sized(CHAT_ATTACHMENT_MAX_BYTES))).toBe(false);
    expect(isChatAttachmentTooLarge(sized(CHAT_ATTACHMENT_MAX_BYTES + 1))).toBe(true);
  });
});

describe('chatAttachmentObjectPath', () => {
  it('keeps the member name out of the key and only its extension in', () => {
    expect(shape(chatAttachmentObjectPath('c-1', 'فاتورة-472.pdf'))).toBe('c-1/<uuid>/file.pdf');
    expect(shape(chatAttachmentObjectPath('c-1', 'report.PDF'))).toBe('c-1/<uuid>/file.pdf');
  });

  it('is one flat segment whatever the name held', () => {
    for (const name of ['folder/report.pdf', '..\\escape.pdf', 're\u0000port\u001f.pdf']) {
      expect(shape(chatAttachmentObjectPath('c-1', name))).toBe('c-1/<uuid>/file.pdf');
    }
    expect(shape(chatAttachmentObjectPath('c-1', '   '))).toBe('c-1/<uuid>/file');
  });

  it('drops an extension a key cannot carry', () => {
    expect(shape(chatAttachmentObjectPath('c-1', 'report.صورة'))).toBe('c-1/<uuid>/file');
    expect(shape(chatAttachmentObjectPath('c-1', 'report.toolongextension'))).toBe(
      'c-1/<uuid>/file'
    );
  });
});

describe('chatAttachmentExtension', () => {
  it('lowercases the last extension and keeps nothing else', () => {
    expect(chatAttachmentExtension('Invoice-472.PNG')).toBe('.png');
    expect(chatAttachmentExtension('a.b.pdf')).toBe('.pdf');
    expect(chatAttachmentExtension('no-extension')).toBe('');
    expect(chatAttachmentExtension('trailing.')).toBe('');
  });
});

describe('chatAttachmentFileName', () => {
  it('keeps the member name the row shows, Arabic and all', () => {
    expect(chatAttachmentFileName('  فاتورة-472.pdf ')).toBe('فاتورة-472.pdf');
    expect(chatAttachmentFileName('   ')).toBe('file');
  });

  it('caps the length the column allows', () => {
    expect(chatAttachmentFileName(`${'a'.repeat(300)}.pdf`)).toHaveLength(200);
  });
});
