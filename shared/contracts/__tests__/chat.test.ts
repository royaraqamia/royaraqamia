import { describe, expect, it } from 'vitest';

import {
  CHAT_EDIT_WINDOW_MS,
  CHAT_GROUP_MEMBERS_MAX,
  ChatMessageSendSchema,
  ChatReportSchema,
  CreateGroupChatSchema,
  canEditChatMessage,
  chatAttachmentIsInlineImage,
  chatTitle,
  normalizeChatBody,
} from '@/shared/contracts/chat';

const peer = {
  id: 'u-2',
  username: 'sara',
  name: 'سارة',
  avatarUrl: null,
  verified: true,
};

describe('normalizeChatBody', () => {
  it('trims and converts Arabic-Indic digits to ASCII (ADR-0054)', () => {
    // Built from escapes on purpose: the repo's own digit gate forbids the
    // literal form in source, and this fixture is exactly what it normalises.
    const arabicIndic = '\u0661\u0662:\u0663\u0660';
    expect(normalizeChatBody(`  الساعة ${arabicIndic}  `)).toBe('الساعة 12:30');
  });

  it('caps the body at the contract ceiling', () => {
    expect(normalizeChatBody('أ'.repeat(5000))).toHaveLength(4000);
  });
});

describe('chatTitle', () => {
  it('names a direct thread after the counterpart', () => {
    expect(chatTitle({ kind: 'direct', title: null, counterpart: peer })).toBe('سارة');
  });

  it('falls back to the handle when the member has no name', () => {
    expect(chatTitle({ kind: 'direct', title: null, counterpart: { ...peer, name: null } })).toBe(
      'sara'
    );
  });

  it('never draws a direct thread without a counterpart as a bare chat', () => {
    expect(chatTitle({ kind: 'direct', title: null, counterpart: null })).toBe('محادثة');
  });

  it('draws a group by its name and the assistant by its own label', () => {
    expect(chatTitle({ kind: 'group', title: 'فريق التصميم', counterpart: null })).toBe(
      'فريق التصميم'
    );
    expect(chatTitle({ kind: 'agent', title: null, counterpart: null })).toBe('المساعد الذكي');
  });
});

describe('canEditChatMessage', () => {
  it('allows an edit inside the window the RLS policy uses', () => {
    const created = '2026-11-01T10:00:00.000Z';
    expect(canEditChatMessage(created, Date.parse(created) + 1000)).toBe(true);
  });

  it('refuses an edit after the window closes', () => {
    const created = '2026-11-01T10:00:00.000Z';
    expect(canEditChatMessage(created, Date.parse(created) + CHAT_EDIT_WINDOW_MS + 1)).toBe(false);
  });

  it('refuses an unparseable timestamp rather than allowing it', () => {
    expect(canEditChatMessage('not-a-date')).toBe(false);
  });
});

describe('ChatMessageSendSchema', () => {
  it('accepts a body', () => {
    expect(ChatMessageSendSchema.safeParse({ body: 'مرحباً' }).success).toBe(true);
  });

  it('accepts attachments without a body', () => {
    const parsed = ChatMessageSendSchema.safeParse({
      attachments: [
        {
          storagePath: 'chat/user/file.pdf',
          fileName: 'ملف.pdf',
          mimeType: 'application/pdf',
          byteSize: 1024,
        },
      ],
    });
    expect(parsed.success).toBe(true);
  });

  it('refuses a message that carries neither', () => {
    expect(ChatMessageSendSchema.safeParse({ body: '   ' }).success).toBe(false);
  });

  it('refuses a file above the 25 MB cap', () => {
    const parsed = ChatMessageSendSchema.safeParse({
      attachments: [
        {
          storagePath: 'chat/user/huge.bin',
          fileName: 'huge.bin',
          mimeType: 'application/octet-stream',
          byteSize: 26 * 1024 * 1024,
        },
      ],
    });
    expect(parsed.success).toBe(false);
  });
});

describe('CreateGroupChatSchema', () => {
  it('needs a name and at least one member', () => {
    expect(CreateGroupChatSchema.safeParse({ title: '', memberIds: [] }).success).toBe(false);
    expect(CreateGroupChatSchema.safeParse({ title: 'فريق', memberIds: [] }).success).toBe(false);
  });

  it('accepts a named group with a member', () => {
    const parsed = CreateGroupChatSchema.safeParse({
      title: 'فريق',
      memberIds: ['5f0f3c62-6a37-4a0b-9f0e-2b4c8f7a1d33'],
    });
    expect(parsed.success).toBe(true);
  });

  /**
   * A group of 32 counts its creator, so the payload carries at most 31: the
   * database trigger is the enforcement, and this is the same number stated
   * before the request is sent.
   */
  it('carries at most 31 invites beside the creator', () => {
    const ids = (count: number) =>
      Array.from(
        { length: count },
        (_, index) => `5f0f3c62-6a37-4a0b-9f0e-${index.toString(16).padStart(12, '0')}`
      );

    expect(
      CreateGroupChatSchema.safeParse({ title: 'فريق', memberIds: ids(CHAT_GROUP_MEMBERS_MAX - 1) })
        .success
    ).toBe(true);
    expect(
      CreateGroupChatSchema.safeParse({ title: 'فريق', memberIds: ids(CHAT_GROUP_MEMBERS_MAX) })
        .success
    ).toBe(false);
  });
});

describe('ChatReportSchema', () => {
  it('needs a reason', () => {
    expect(ChatReportSchema.safeParse({ reason: '  ' }).success).toBe(false);
  });

  it('accepts a reason with the reported side', () => {
    const parsed = ChatReportSchema.safeParse({
      reason: 'إساءة',
      reportedUserId: '0d6a1b51-52a1-4c1f-8a4e-9b0b3d8f6a11',
    });
    expect(parsed.success).toBe(true);
  });
});

describe('chatAttachmentIsInlineImage', () => {
  it('draws a real image and nothing else', () => {
    expect(chatAttachmentIsInlineImage('image/png')).toBe(true);
    expect(chatAttachmentIsInlineImage('IMAGE/JPEG')).toBe(true);
  });

  it('treats SVG, HTML and XML as files (ADR-0113)', () => {
    expect(chatAttachmentIsInlineImage('image/svg+xml')).toBe(false);
    expect(chatAttachmentIsInlineImage('text/html')).toBe(false);
    expect(chatAttachmentIsInlineImage('application/xml')).toBe(false);
    expect(chatAttachmentIsInlineImage('application/pdf')).toBe(false);
  });
});

describe('ChatMessageSendSchema attachments', () => {
  it('accepts any file type up to five per message', () => {
    const attachment = {
      storagePath: 'c-1/u-1/report.pdf',
      fileName: 'report.pdf',
      mimeType: 'application/pdf',
      byteSize: 1024,
    };

    expect(
      ChatMessageSendSchema.safeParse({ attachments: Array.from({ length: 5 }, () => attachment) })
        .success
    ).toBe(true);
    expect(
      ChatMessageSendSchema.safeParse({ attachments: Array.from({ length: 6 }, () => attachment) })
        .success
    ).toBe(false);
  });

  it('refuses a file the bucket would refuse, with the size sentence', () => {
    const parsed = ChatMessageSendSchema.safeParse({
      attachments: [
        {
          storagePath: 'c-1/u-1/big.zip',
          fileName: 'big.zip',
          mimeType: 'application/zip',
          byteSize: 30 * 1024 * 1024,
        },
      ],
    });

    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0]?.message).toContain('25');
    }
  });
});
