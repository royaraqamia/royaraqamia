import { describe, it, expect } from 'vitest';
import type { PublicUser } from '@/shared/contracts/users';
import { withPinnedSelf, type ViewerMember } from '../member-pin';

function member(id: string, username = id): PublicUser {
  return {
    id,
    username,
    name: username,
    avatar_url: null,
    bio: null,
    verified: true,
  };
}

const viewer: ViewerMember = {
  id: 'me',
  username: 'royaraqamia',
  name: 'رؤية رقميّة',
  avatarUrl: 'https://example.test/me.png',
};

const roster = [member('a'), member('b'), member('me'), member('c')];

describe('withPinnedSelf', () => {
  it('leaves the roster untouched for a guest', () => {
    const result = withPinnedSelf(roster, null);

    expect(result.members).toBe(roster);
    expect(result.selfId).toBeNull();
  });

  it('moves the viewer’s listed row to the head without duplicating it', () => {
    const result = withPinnedSelf(roster, viewer);

    expect(result.members.map((m) => m.id)).toEqual(['me', 'a', 'b', 'c']);
    expect(result.members.filter((m) => m.id === 'me')).toHaveLength(1);
    expect(result.selfId).toBe('me');
  });

  it('keeps the roster’s own row rather than the session’s copy', () => {
    const result = withPinnedSelf(roster, viewer);

    expect(result.members[0]).toBe(roster[2]);
  });

  it('pins a viewer the roster’s cap left out, built from the session', () => {
    const result = withPinnedSelf([member('a'), member('b')], viewer);

    expect(result.members.map((m) => m.id)).toEqual(['me', 'a', 'b']);
    expect(result.members[0]).toMatchObject({
      id: 'me',
      username: 'royaraqamia',
      name: 'رؤية رقميّة',
      avatar_url: 'https://example.test/me.png',
      bio: null,
    });
    expect(result.selfId).toBe('me');
  });

  it('still pins a viewer the roster already had first', () => {
    const result = withPinnedSelf([member('me'), member('a')], viewer);

    expect(result.members.map((m) => m.id)).toEqual(['me', 'a']);
  });

  it('pins the viewer even when the roster is empty', () => {
    const result = withPinnedSelf([], viewer);

    expect(result.members.map((m) => m.id)).toEqual(['me']);
    expect(result.selfId).toBe('me');
  });
});
