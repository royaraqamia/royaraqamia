import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const navigation = vi.hoisted(() => ({ pathname: '/' }));

vi.mock('next/navigation', () => ({
  usePathname: () => navigation.pathname,
}));

// The conversation chunk is not this test's subject; the door is.
vi.mock('@/frontend/ui/assistant/assistant-panel', () => ({
  AssistantPanel: () => <div data-testid="assistant-panel" />,
}));

import { AssistantLauncher } from '@/frontend/ui/assistant/assistant-launcher';

/**
 * The door in the corner (ADR-0143): on every screen except the one that is
 * already the conversation, and the sign-in flow.
 */
describe('AssistantLauncher', () => {
  beforeEach(() => {
    navigation.pathname = '/';
  });

  it('offers the assistant on a normal screen', () => {
    render(<AssistantLauncher />);

    expect(screen.getByRole('button', { name: 'اسأل نور، مساعدة رؤية رقمية' })).toBeInTheDocument();
  });

  it('is not drawn on the assistant thread it would open', () => {
    navigation.pathname = '/chats/a-1';
    render(<AssistantLauncher />);

    expect(screen.queryByRole('button', { name: /اسأل نور/ })).not.toBeInTheDocument();
  });

  it('is not drawn inside the sign-in flow', () => {
    navigation.pathname = '/auth/login';
    render(<AssistantLauncher />);

    expect(screen.queryByRole('button', { name: /اسأل نور/ })).not.toBeInTheDocument();
  });

  it('is drawn on a page whose path merely starts with the same letters', () => {
    navigation.pathname = '/chatsomething';
    render(<AssistantLauncher />);

    expect(screen.getByRole('button', { name: /اسأل نور/ })).toBeInTheDocument();
  });
});
