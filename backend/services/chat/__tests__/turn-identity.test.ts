import { describe, expect, it } from 'vitest';

import {
  IDENTITY_BLOCK_CHARS_MAX,
  identityBlock,
  projectIdentity,
  turnContextMessages,
  type TurnIdentity,
} from '@/backend/services/chat/turn-identity';

/**
 * The identity block (ADR-0182, decision 1): who the turn is talking to, from
 * the account row, before the model is asked anything.
 */
const PROFILE = {
  name: 'ريم',
  username: 'reem',
  avatar_url: 'https://example.test/storage/avatar.png',
  email: 'reem@example.test',
};

function identity(overrides: Partial<TurnIdentity> = {}): TurnIdentity {
  return {
    displayName: 'ريم',
    username: 'reem',
    avatarUrl: null,
    hasEmail: true,
    plan: 'pro',
    connectedApps: 2,
    ...overrides,
  };
}

describe('projectIdentity', () => {
  it('reads the row into the block and never carries the address itself', () => {
    const projected = projectIdentity({ profile: PROFILE, plan: 'pro', connectedApps: 3 });

    expect(projected).toEqual({
      displayName: 'ريم',
      username: 'reem',
      avatarUrl: 'https://example.test/storage/avatar.png',
      hasEmail: true,
      plan: 'pro',
      connectedApps: 3,
    });
  });

  it('falls back to the handle when the row has no name', () => {
    const projected = projectIdentity({
      profile: { ...PROFILE, name: '   ' },
      plan: 'free',
    });

    expect(projected?.displayName).toBe('reem');
  });

  it('never answers with an empty name, even on a row with neither', () => {
    const projected = projectIdentity({
      profile: { ...PROFILE, name: null, username: null as unknown as string },
      plan: 'free',
    });

    expect(projected?.displayName).toBe('عضو');
    expect(projected?.username).toBeNull();
  });

  it('is nothing at all when there is no row to project', () => {
    expect(projectIdentity({ profile: null, plan: 'free' })).toBeNull();
  });

  it('counts no app when the marketplace answers nothing', () => {
    expect(projectIdentity({ profile: PROFILE, plan: 'free' })?.connectedApps).toBe(0);
    expect(
      projectIdentity({ profile: PROFILE, plan: 'free', connectedApps: -4 })?.connectedApps
    ).toBe(0);
  });
});

describe('identityBlock', () => {
  it('names the member, the handle, the plan and the connected apps', () => {
    const block = identityBlock(identity());

    expect(block).toContain('ريم');
    expect(block).toContain('reem');
    expect(block).toContain('المدفوعة');
    expect(block).toContain('التطبيقات المتصلة: 2');
  });

  it('says the server supplied it and not to ask again', () => {
    const block = identityBlock(identity());

    expect(block).toContain('وصلت من الخادم');
    expect(block).toContain('لا تطلبيها من العضو');
  });

  it('never writes the address out, only that one is on file', () => {
    const block = identityBlock(identity());

    expect(block).toContain('مسجَّل');
    expect(block).not.toContain('reem@example.test');
    expect(block).not.toContain('@example');
  });

  it('says so when the account has no address', () => {
    const block = identityBlock(identity({ hasEmail: false }));

    expect(block).toContain('لا يوجد بريد');
  });

  it('stays inside the layer budget even when a row is absurd', () => {
    const block = identityBlock(
      identity({
        displayName: 'ا'.repeat(5_000),
        username: 'u'.repeat(5_000),
        avatarUrl: `https://example.test/${'p'.repeat(5_000)}`,
      })
    );

    expect(block.length).toBeLessThanOrEqual(IDENTITY_BLOCK_CHARS_MAX);
  });
});

describe('turnContextMessages', () => {
  it('opens the turn with one block, ahead of the standing prompt', () => {
    const messages = turnContextMessages(identity());

    expect(messages).toHaveLength(1);
    expect(messages[0]?.role).toBe('system');
  });

  it('adds nothing at all when there is no identity to project', () => {
    expect(turnContextMessages(null)).toEqual([]);
  });

  it('opens recall as its own block, after identity and before the prompt', () => {
    const messages = turnContextMessages(identity(), undefined, [
      {
        memoryId: 'memory-1',
        text: 'أحب القهوة السادة',
        similarity: 0.82,
        updatedAt: '2026-10-03T09:00:00.000Z',
      },
    ]);

    expect(messages).toHaveLength(2);
    expect(messages[0]?.role).toBe('system');
    expect(messages[1]?.role).toBe('system');

    // The fact, its source sentence, and the date it was saved — one line each.
    expect(String(messages[1]?.content)).toContain('أحب القهوة السادة');
    expect(String(messages[1]?.content)).toContain('من محادثتنا في');
    expect(String(messages[1]?.content)).toMatch(/3 أكتوبر/);
  });

  it('injects no recall block when recall found nothing', () => {
    expect(turnContextMessages(null, undefined, [])).toEqual([]);
  });

  it('opens the summary as its own block, after recall and nearest the history', () => {
    const messages = turnContextMessages(
      identity(),
      undefined,
      [
        {
          memoryId: 'memory-1',
          text: 'أحب القهوة السادة',
          similarity: 0.82,
          updatedAt: '2026-10-03T09:00:00.000Z',
        },
      ],
      {
        text: 'اتفقتا على أن تبدأ الميزانية في 15 من كل شهر.',
        throughMessageId: 'message-20',
        updatedAt: '2026-11-15T09:00:00.000Z',
      }
    );

    expect(messages).toHaveLength(3);
    expect(String(messages[1]?.content)).toContain('أحب القهوة السادة');
    expect(String(messages[2]?.content)).toContain('اتفقتا على أن تبدأ الميزانية');
  });

  it('labels the summary as the server’s account of the thread, never the member’s words', () => {
    const messages = turnContextMessages(null, undefined, [], {
      text: 'اتفقتا على أن تبدأ الميزانية في 15 من كل شهر.',
      throughMessageId: 'message-20',
      updatedAt: '2026-11-15T09:00:00.000Z',
    });

    // The header is what stops a paragraph of past conversation from reading as
    // something the member just said.
    expect(messages).toHaveLength(1);
    expect(String(messages[0]?.content)).toContain('ليس رسالة من العضو');
    expect(String(messages[0]?.content)).toContain('لا تنسبي نصّه إلى العضو');
  });

  it('injects no summary block for a conversation that has none', () => {
    expect(turnContextMessages(null, undefined, [], null)).toEqual([]);
    expect(
      turnContextMessages(null, undefined, [], {
        text: '   ',
        throughMessageId: null,
        updatedAt: '',
      })
    ).toEqual([]);
  });

  it('opens the specialist shortlist after recall and before the summary', () => {
    const messages = turnContextMessages(
      identity(),
      undefined,
      [
        {
          memoryId: 'memory-1',
          text: 'أحب القهوة السادة',
          similarity: 0.82,
          updatedAt: '2026-10-03T09:00:00.000Z',
        },
      ],
      {
        text: 'اتفقتا على أن تبدأ الميزانية في 15 من كل شهر.',
        throughMessageId: 'message-20',
        updatedAt: '2026-11-15T09:00:00.000Z',
      },
      [
        {
          id: 'design-brand-guardian',
          name: 'Brand Guardian',
          description: 'Expert brand strategist and guardian.',
          score: 0.81,
        },
      ]
    );

    expect(messages).toHaveLength(4);
    expect(String(messages[2]?.content)).toContain('design-brand-guardian');
    expect(String(messages[3]?.content)).toContain('اتفقتا على أن تبدأ الميزانية');
  });

  it('carries no shortlist when the router offered nothing', () => {
    const messages = turnContextMessages(identity(), undefined, [], null, []);
    expect(messages).toHaveLength(1);
  });
});
