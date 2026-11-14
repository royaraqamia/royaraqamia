import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { FollowButton } from '../follow-button';
import type { FollowToggleResponse } from '@/shared/contracts/follows';

const { api, live } = vi.hoisted(() => ({
  api: {
    followMember: vi.fn(),
    unfollowMember: vi.fn(),
    unblockMember: vi.fn(),
  },
  live: { publishFollowCounts: vi.fn() },
}));

vi.mock('@/frontend/api/follows', () => api);
vi.mock('@/frontend/shared/follow-live', () => live);

/** A write that stays in flight until the test releases it. */
function deferred() {
  let release: (body: FollowToggleResponse) => void = () => {};
  const promise = new Promise<FollowToggleResponse>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('FollowButton busy label', () => {
  it('names the follow while the follow is being written', async () => {
    const follow = deferred();
    api.followMember.mockReturnValue(follow.promise);

    render(<FollowButton username="sara" initialState="not_following" signedIn />);
    fireEvent.click(screen.getByRole('button', { name: 'متابعة' }));

    expect(await screen.findByRole('button', { name: 'جاري المتابعة...' })).toBeDisabled();

    follow.release({ success: true, state: 'following' });
    expect(await screen.findByRole('button', { name: 'إلغاء المتابعة' })).toBeEnabled();
  });

  it('names the unfollow while the unfollow is being written', async () => {
    const unfollow = deferred();
    api.unfollowMember.mockReturnValue(unfollow.promise);

    render(<FollowButton username="sara" initialState="following" signedIn />);
    fireEvent.click(screen.getByRole('button', { name: 'إلغاء المتابعة' }));
    fireEvent.click(await screen.findByRole('button', { name: 'نعم، إلغاء المتابعة' }));

    expect(await screen.findByRole('button', { name: 'جاري إلغاء المتابعة...' })).toBeDisabled();

    unfollow.release({ success: true, state: 'not_following' });
    expect(await screen.findByRole('button', { name: 'متابعة' })).toBeEnabled();
  });

  it('names the unblock while the block is being lifted', async () => {
    const unblock = deferred();
    api.unblockMember.mockReturnValue(unblock.promise);

    render(<FollowButton username="sara" memberId="member-1" initialState="blocked" signedIn />);
    fireEvent.click(screen.getByRole('button', { name: 'إلغاء الحظر' }));

    expect(await screen.findByRole('button', { name: 'جاري إلغاء الحظر...' })).toBeDisabled();
    expect(api.unblockMember).toHaveBeenCalledWith('member-1');

    unblock.release({ success: true, state: 'not_following' });
    await waitFor(() => expect(screen.getByRole('button', { name: 'متابعة' })).toBeEnabled());
  });
});
