import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  getBlockedChatMembers: vi.fn(),
  unblockChatUser: vi.fn(),
}));

vi.mock('@/frontend/api/chats', () => mocks);

const session = vi.hoisted(() => ({
  useSession: vi.fn(),
}));

vi.mock('@/frontend/state/session-provider', () => session);

vi.mock('next/image', () => ({
  default: ({ alt, src }: { alt: string; src: string }) => <img alt={alt} src={src} />,
}));

import { BlockedMembersView } from '../blocked-members-view';

const SARA = {
  id: 'user-2',
  username: 'sara',
  name: 'سارة',
  avatarUrl: null,
  verified: true,
};

const OMAR = {
  id: 'user-3',
  username: 'omar',
  name: null,
  avatarUrl: null,
  verified: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getBlockedChatMembers.mockResolvedValue([SARA, OMAR]);
  mocks.unblockChatUser.mockResolvedValue({ success: true });
  session.useSession.mockReturnValue({ user: { id: 'user-1' }, isLoading: false });
});

afterEach(cleanup);

describe('BlockedMembersView', () => {
  it('points a guest at sign-in without reading the list', async () => {
    session.useSession.mockReturnValue({ user: null, isLoading: false });
    render(<BlockedMembersView />);

    expect(await screen.findByRole('link', { name: 'تسجيل الدُّخول' })).toHaveAttribute(
      'href',
      '/auth/login?redirect=%2Faccount%2Fblocked'
    );
    expect(mocks.getBlockedChatMembers).not.toHaveBeenCalled();
  });

  it('lists each blocked member with their name and handle', async () => {
    render(<BlockedMembersView />);

    expect(await screen.findByText('سارة')).toBeInTheDocument();
    expect(screen.getByText('@sara')).toBeInTheDocument();
    expect(screen.getByText('@omar')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /إلغاء الحظر عن/ })).toHaveLength(2);
  });

  it('draws the page sentence when the member has blocked nobody', async () => {
    mocks.getBlockedChatMembers.mockResolvedValue([]);
    render(<BlockedMembersView />);

    expect(await screen.findByText('لم تحظر أحداً.')).toBeInTheDocument();
  });

  it('removes the row only after the server accepts the unblock', async () => {
    render(<BlockedMembersView />);

    fireEvent.click(await screen.findByRole('button', { name: 'إلغاء الحظر عن سارة' }));

    await waitFor(() => expect(mocks.unblockChatUser).toHaveBeenCalledWith('user-2'));
    await waitFor(() => expect(screen.queryByText('سارة')).not.toBeInTheDocument());
    expect(screen.getByText('@omar')).toBeInTheDocument();
  });

  it('keeps the row and shows the reason when the server refuses', async () => {
    mocks.unblockChatUser.mockRejectedValue(new Error('الخدمة غير متاحة'));
    render(<BlockedMembersView />);

    fireEvent.click(await screen.findByRole('button', { name: 'إلغاء الحظر عن سارة' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('الخدمة غير متاحة');
    expect(screen.getByText('سارة')).toBeInTheDocument();
  });

  it('falls back to the page sentence when the list cannot be read', async () => {
    mocks.getBlockedChatMembers.mockRejectedValue(new Error(''));
    render(<BlockedMembersView />);

    expect(await screen.findByRole('alert')).toHaveTextContent('تعذّر تحميل القائمة');
  });
});
