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
});
