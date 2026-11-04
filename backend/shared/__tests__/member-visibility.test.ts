import { describe, expect, it } from 'vitest';
import { canViewMember } from '@/backend/shared/member-visibility';

const member = { id: 'member-1', is_hidden: true };
const otherMember = { id: 'member-2', is_hidden: false };

describe('canViewMember', () => {
  it('lets the public see a listed member', () => {
    expect(canViewMember(otherMember, { id: null, isAdmin: false })).toBe(true);
  });

  it('hides a hidden member from a signed-out visitor', () => {
    expect(canViewMember(member, { id: null, isAdmin: false })).toBe(false);
  });

  it('hides a hidden member from another signed-in member', () => {
    expect(canViewMember(member, { id: 'member-2', isAdmin: false })).toBe(false);
  });

  it('shows a hidden member its own profile', () => {
    expect(canViewMember(member, { id: 'member-1', isAdmin: false })).toBe(true);
  });

  it('shows a hidden member to an Admin', () => {
    expect(canViewMember(member, { id: 'admin-9', isAdmin: true })).toBe(true);
  });
});
