import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

const navigation = vi.hoisted(() => ({ pathname: '/' }));

vi.mock('next/navigation', () => ({
  usePathname: () => navigation.pathname,
}));

// The conversation chunk is not this test's subject; the door and the hand-off
// to the panel are. The stub keeps `open` so a close can be observed.
vi.mock('@/frontend/ui/assistant/assistant-panel', () => ({
  AssistantPanel: ({ open, onDismiss }: { open: boolean; onDismiss: () => void }) => (
    <div data-testid="assistant-panel" data-open={open}>
      <button type="button" onClick={onDismiss}>
        إغلاق
      </button>
    </div>
  ),
}));

import { AssistantLauncher } from '@/frontend/ui/assistant/assistant-launcher';

/**
 * The door in the corner (ADR-0143): on every screen except the one that is
 * already the conversation, and the sign-in flow.
 */
describe('AssistantLauncher', () => {
  beforeEach(() => {
    navigation.pathname = '/';
    window.localStorage.clear();
  });

  afterEach(() => {
    delete (window as { requestIdleCallback?: unknown }).requestIdleCallback;
    delete (navigator as { connection?: unknown }).connection;
  });

  /** jsdom has no idle scheduler; the effect falls back to a timer otherwise. */
  function stubIdleCallback() {
    const idle = vi.fn(() => 1);
    Object.defineProperty(window, 'requestIdleCallback', { configurable: true, value: idle });
    return idle;
  }

  function reportConnection(connection: Record<string, unknown> | undefined) {
    Object.defineProperty(navigator, 'connection', { configurable: true, value: connection });
  }

  it('offers the assistant on a normal screen', () => {
    render(<AssistantLauncher />);

    expect(screen.getByRole('button', { name: 'افتح المحادثة مع نور' })).toBeInTheDocument();
  });

  it('is not drawn on the assistant thread it would open', () => {
    navigation.pathname = '/chats/a-1';
    render(<AssistantLauncher />);

    expect(screen.queryByRole('button', { name: /افتح المحادثة مع نور/ })).not.toBeInTheDocument();
  });

  it('is not drawn inside the sign-in flow', () => {
    navigation.pathname = '/auth/login';
    render(<AssistantLauncher />);

    expect(screen.queryByRole('button', { name: /افتح المحادثة مع نور/ })).not.toBeInTheDocument();
  });

  it('is drawn on a page whose path merely starts with the same letters', () => {
    navigation.pathname = '/chatsomething';
    render(<AssistantLauncher />);

    expect(screen.getByRole('button', { name: /افتح المحادثة مع نور/ })).toBeInTheDocument();
  });

  it('keeps the conversation mounted after it closes (ADR-0150)', async () => {
    render(<AssistantLauncher />);

    fireEvent.click(screen.getByRole('button', { name: /افتح المحادثة مع نور/ }));

    const panel = await screen.findByTestId('assistant-panel');
    expect(panel).toHaveAttribute('data-open', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'إغلاق' }));

    // Closed, not thrown away: the next open paints what the last one held
    // instead of fetching the same thread again.
    expect(panel).toHaveAttribute('data-open', 'false');
    expect(screen.getByTestId('assistant-panel')).toBe(panel);
  });

  it('warms the chunk for a returning reader while the page is idle (ADR-0150)', () => {
    window.localStorage.setItem('royaraqamia:assistant:opened', '1');
    const idle = stubIdleCallback();

    render(<AssistantLauncher />);

    expect(idle).toHaveBeenCalledTimes(1);
  });

  it('pays nothing for the warm-up on a first visit', () => {
    const idle = stubIdleCallback();

    render(<AssistantLauncher />);

    expect(idle).not.toHaveBeenCalled();
  });

  it('leaves the chunk for the tap when the member asked to save data (ADR-0230)', () => {
    window.localStorage.setItem('royaraqamia:assistant:opened', '1');
    reportConnection({ saveData: true, effectiveType: '4g' });
    const idle = stubIdleCallback();

    render(<AssistantLauncher />);

    expect(idle).not.toHaveBeenCalled();
  });

  it('leaves the chunk for the tap on a 2g connection (ADR-0230)', () => {
    window.localStorage.setItem('royaraqamia:assistant:opened', '1');
    reportConnection({ saveData: false, effectiveType: '2g' });
    const idle = stubIdleCallback();

    render(<AssistantLauncher />);

    expect(idle).not.toHaveBeenCalled();
  });
});
