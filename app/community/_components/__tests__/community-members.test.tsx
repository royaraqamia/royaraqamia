import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { PublicUser } from '@/shared/contracts/users';
import { CommunityMembersPanel, CommunityMembersStrip } from '../community-members';

const session = vi.hoisted(() => ({
  current: {
    user: null,
    isLoading: false,
    profileUsername: null,
    profileName: null,
    profileAvatarUrl: null,
  } as {
    user: { id: string } | null;
    isLoading: boolean;
    profileUsername: string | null;
    profileName: string | null;
    profileAvatarUrl: string | null;
  },
}));

vi.mock('@/frontend/state/session-provider', () => ({
  useSession: () => session.current,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));

function member(id: string, username: string, name: string | null = username): PublicUser {
  return { id, username, name, avatar_url: null, bio: null, verified: true };
}

const roster = [
  member('u1', 'salah-talb', 'صالح طالب'),
  member('u2', 'mahmoud-hamada', 'Mahmoud Hamada'),
  member('u3', 'royaraqamia', 'رؤية رقميّة'),
];

beforeEach(() => {
  session.current = {
    user: null,
    isLoading: false,
    profileUsername: null,
    profileName: null,
    profileAvatarUrl: null,
  };
});

describe('CommunityMembersPanel', () => {
  it('keeps the roster order and adds no marker for a guest', () => {
    render(<CommunityMembersPanel members={roster} />);

    const rows = within(screen.getByRole('list')).getAllByRole('link');
    expect(rows.map((row) => row.getAttribute('href'))).toEqual([
      '/u/salah-talb',
      '/u/mahmoud-hamada',
      '/u/royaraqamia',
    ]);
    expect(screen.queryByText('أنت')).not.toBeInTheDocument();
  });

  it('gives a guest a follow control that opens the sign-in prompt', () => {
    render(<CommunityMembersPanel members={roster} signInReturnTo="/community" />);

    const buttons = screen.getAllByRole('button', { name: 'متابعة' });
    expect(buttons).toHaveLength(roster.length);

    fireEvent.click(buttons[0]!);

    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByRole('link')).toHaveAttribute(
      'href',
      '/auth/login?redirect=%2Fcommunity'
    );
  });

  it('draws no control for a signed-in viewer whose states never arrived', () => {
    session.current = {
      user: { id: 'u3' },
      isLoading: false,
      profileUsername: 'royaraqamia',
      profileName: 'رؤية رقميّة',
      profileAvatarUrl: null,
    };

    render(<CommunityMembersPanel members={roster} />);

    expect(screen.queryByRole('button', { name: 'متابعة' })).not.toBeInTheDocument();
  });

  it('waits for the session before drawing the guest control', () => {
    session.current = {
      user: null,
      isLoading: true,
      profileUsername: null,
      profileName: null,
      profileAvatarUrl: null,
    };

    render(<CommunityMembersPanel members={roster} />);

    expect(screen.queryByRole('button', { name: 'متابعة' })).not.toBeInTheDocument();
  });

  it('pins the signed-in member first and labels only their row', () => {
    session.current = {
      user: { id: 'u3' },
      isLoading: false,
      profileUsername: 'royaraqamia',
      profileName: 'رؤية رقميّة',
      profileAvatarUrl: null,
    };

    render(<CommunityMembersPanel members={roster} />);

    const rows = within(screen.getByRole('list')).getAllByRole('link');
    expect(rows.map((row) => row.getAttribute('href'))).toEqual([
      '/u/royaraqamia',
      '/u/salah-talb',
      '/u/mahmoud-hamada',
    ]);
    expect(within(rows[0]!).getByText('أنت')).toBeInTheDocument();
    expect(screen.getAllByText('أنت')).toHaveLength(1);
  });

  it('draws one follow control per row, never on the viewer’s own', () => {
    session.current = {
      user: { id: 'u3' },
      isLoading: false,
      profileUsername: 'royaraqamia',
      profileName: 'رؤية رقميّة',
      profileAvatarUrl: null,
    };

    render(
      <CommunityMembersPanel
        members={roster}
        states={{ u1: 'not_following', u2: 'following', u3: 'self' }}
      />
    );

    // The viewer's row carries «أنت» beside the name and no pill below it.
    expect(screen.getAllByText('أنت')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'متابعة' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'إلغاء المتابعة' })).toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(2);
  });

  it('pins a member the roster does not list', () => {
    session.current = {
      user: { id: 'u9' },
      isLoading: false,
      profileUsername: 'new-member',
      profileName: 'عضو جديد',
      profileAvatarUrl: null,
    };

    render(<CommunityMembersPanel members={roster} />);

    const rows = within(screen.getByRole('list')).getAllByRole('link');
    expect(rows).toHaveLength(roster.length + 1);
    expect(rows[0]).toHaveAttribute('href', '/u/new-member');
    expect(within(rows[0]!).getByText('عضو جديد')).toBeInTheDocument();
  });

  it('waits for the session before pinning anything', () => {
    session.current = {
      user: { id: 'u3' },
      isLoading: false,
      profileUsername: null,
      profileName: null,
      profileAvatarUrl: null,
    };

    render(<CommunityMembersPanel members={roster} />);

    const rows = within(screen.getByRole('list')).getAllByRole('link');
    expect(rows[0]).toHaveAttribute('href', '/u/salah-talb');
    expect(screen.queryByText('أنت')).not.toBeInTheDocument();
  });
});

describe('CommunityMembersStrip', () => {
  it('pins and labels the viewer’s chip the same way', () => {
    session.current = {
      user: { id: 'u3' },
      isLoading: false,
      profileUsername: 'royaraqamia',
      profileName: 'رؤية رقميّة',
      profileAvatarUrl: null,
    };

    render(<CommunityMembersStrip members={roster} />);

    const rows = within(screen.getByRole('list')).getAllByRole('link');
    expect(rows[0]).toHaveAttribute('href', '/u/royaraqamia');
    expect(within(rows[0]!).getByText('أنت')).toBeInTheDocument();
    expect(screen.getAllByText('أنت')).toHaveLength(1);
  });
});
