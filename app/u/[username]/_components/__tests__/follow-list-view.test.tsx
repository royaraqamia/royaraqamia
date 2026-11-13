import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { FollowListEntry } from '@/shared/contracts/follows';
import { FollowListView } from '../follow-list-view';

function entry(username: string, name: string | null, following: boolean): FollowListEntry {
  return {
    id: `u-${username}`,
    username,
    name,
    avatar_url: null,
    bio: null,
    verified: true,
    following,
  };
}

const members = [
  entry('salah-talb', 'صالح طالب', false),
  entry('mahmoud-hamada', 'Mahmoud Hamada', true),
];

/**
 * The owner's own list: one row per member, and the control that belongs to a
 * list of people - the state it is in, drawn from the server's own answer.
 */
describe('FollowListView', () => {
  it('draws the page title and the follow control each row is in', () => {
    render(<FollowListView kind="followers" members={members} total={2} page={1} pageSize={20} />);

    expect(screen.getByRole('heading', { level: 1, name: 'المتابِعون' })).toBeInTheDocument();
    expect(screen.queryByText('عودة إلى الملف')).not.toBeInTheDocument();

    expect(screen.getByRole('button', { name: 'متابعة' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'إلغاء المتابعة' })).toBeInTheDocument();
  });

  it('says which list is empty rather than drawing a control', () => {
    render(<FollowListView kind="following" members={[]} total={0} page={1} pageSize={20} />);

    expect(screen.getByRole('heading', { level: 1, name: 'المتابَعون' })).toBeInTheDocument();
    expect(screen.getByText('لا يوجد متابَعون بعد.')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
