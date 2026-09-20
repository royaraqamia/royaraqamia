import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const mockResolveAdmin = vi.fn();
const mockRedirect = vi.fn();

const NEXT_REDIRECT = 'NEXT_REDIRECT';
const SIGN_IN_TARGET = '/auth/login?redirect=/admin';
const AWAY_FROM_CONSOLE = '/';

vi.mock('next/navigation', () => ({
  redirect: (url: string) => mockRedirect(url),
}));

vi.mock('@/backend/config/identity', async () => {
  const { identityDouble } = await import('@/backend/identity/__tests__/test-double');
  return identityDouble({
    session: async () => ({ user: null, client: null }),
    admin: () => mockResolveAdmin(),
  });
});

vi.mock('@/frontend/ui/Navbar', () => ({
  Navbar: () => <nav data-testid="navbar" />,
}));

import AdminLayout from '../layout';

const ADMIN = {
  kind: 'admin' as const,
  identity: { user: { id: 'admin-1', email: 'admin@example.com' }, client: {} },
};

async function expectDoorRedirect(resolution: unknown, target: string) {
  mockResolveAdmin.mockResolvedValue(resolution);

  await expect(AdminLayout({ children: null })).rejects.toThrow(NEXT_REDIRECT);
  expect(mockRedirect).toHaveBeenCalledWith(target);
}

describe('Admin Console door', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Mirror Next's redirect: it throws so no console shell is rendered.
    mockRedirect.mockImplementation(() => {
      throw new Error(NEXT_REDIRECT);
    });
  });

  it('sends a signed-out request to sign in', async () => {
    await expectDoorRedirect({ kind: 'anonymous' }, SIGN_IN_TARGET);
  });

  it('sends a signed-in non-Admin away from the console', async () => {
    await expectDoorRedirect({ kind: 'forbidden' }, AWAY_FROM_CONSOLE);
  });

  it('renders the console shell for an Admin', async () => {
    mockResolveAdmin.mockResolvedValue(ADMIN);

    render(await AdminLayout({ children: <div>console-section</div> }));

    expect(screen.getByTestId('navbar')).toBeInTheDocument();
    expect(screen.getByText('console-section')).toBeInTheDocument();
    expect(mockRedirect).not.toHaveBeenCalled();
  });
});
