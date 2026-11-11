import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  getClient: vi.fn(),
  getUser: vi.fn(),
  redirect: vi.fn(),
  adminEmails: [] as string[],
}));

vi.mock('next/navigation', () => ({
  redirect: (url: string) => mocks.redirect(url),
}));

vi.mock('@/backend/config/env', () => ({
  env: {
    baseUrl: 'https://royaraqamia.com',
    mcpTokenEncryptionKey: '00'.repeat(32),
    adminEmails: mocks.adminEmails,
  },
}));

vi.mock('@/backend/config/mcp', () => ({
  createDefaultMcpOAuthProvider: () => ({ getClient: mocks.getClient }),
}));

vi.mock('@/backend/config/supabase', () => ({
  createServerSupabaseClient: async () => ({ auth: { getUser: () => mocks.getUser() } }),
}));

vi.mock('@/frontend/ui/PWAProvider', () => ({
  usePWAContext: () => ({ isOnline: true }),
}));

import { SCOPE_LABELS } from '@/backend/services/mcp/scope';
import ConnectPage from '@/app/mcp/connect/page';

const client = {
  id: 'client-1',
  client_name: 'Client 1',
  redirect_uris: ['https://client.example/callback'],
  scopes: ['tools/read'],
  expires_at: null,
  client_secret_hash: null,
  created_at: '2026-08-01T00:00:00.000Z',
};

async function renderPage(scope: string, email = 'member@example.com') {
  mocks.getUser.mockResolvedValue({ data: { user: { id: 'u-1', email } } });
  const page = await ConnectPage({
    searchParams: Promise.resolve({
      client_id: 'client-1',
      redirect_uri: 'https://client.example/callback',
      scope,
      state: 'state-123',
      code_challenge: 'challenge',
      code_challenge_method: 'S256',
    }),
  });
  return render(page);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.adminEmails.length = 0;
  mocks.getClient.mockResolvedValue(client);
  // Mirror Next's redirect: it throws so no consent screen is rendered.
  mocks.redirect.mockImplementation(() => {
    throw new Error('NEXT_REDIRECT');
  });
});

// #1265: the member approves the set the consent route will actually grant, in
// the labels that name each permission, not the raw ids a client typed.
describe('MCP consent screen', () => {
  it('names every granted permission from SCOPE_LABELS', async () => {
    await renderPage('community.read linksnap.write');

    expect(screen.getByText(SCOPE_LABELS['community.read'])).toBeInTheDocument();
    expect(screen.getByText(SCOPE_LABELS['linksnap.write'])).toBeInTheDocument();
    expect(screen.queryByText('community.read')).toBeNull();
    expect(screen.queryByText('linksnap.write')).toBeNull();
    expect(screen.getByRole('button', { name: 'السَّماح' })).toBeInTheDocument();
  });

  it('names the callback host the member is trusting', async () => {
    await renderPage('community.read');

    expect(screen.getByText('client.example')).toBeInTheDocument();
  });

  it('shows no admin permission to a member the route would drop it for', async () => {
    await renderPage('profile.read admin');

    expect(screen.getByText(SCOPE_LABELS['profile.read'])).toBeInTheDocument();
    expect(screen.queryByText(SCOPE_LABELS.admin)).toBeNull();
  });

  it('shows the admin permission to an Admin email', async () => {
    mocks.adminEmails.push('member@example.com');

    await renderPage('profile.read admin');

    expect(screen.getByText(SCOPE_LABELS.admin)).toBeInTheDocument();
  });

  it('refuses an empty grant instead of offering approval', async () => {
    await renderPage('unknown.scope');

    expect(screen.getByRole('alert')).toHaveTextContent('لا يمكن السَّماح له بالوصول');
    expect(screen.queryByRole('button', { name: 'السَّماح' })).toBeNull();
    expect(screen.getByRole('button', { name: 'رفض' })).toBeInTheDocument();
  });
});
