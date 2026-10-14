import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { UpdatePrompt } from '../update-prompt';

const state = vi.hoisted(() => ({
  updateAvailable: false,
  shellPending: false,
  applyUpdate: vi.fn(),
}));

vi.mock('@/frontend/ui/PWAProvider', () => ({
  usePWAContext: () => ({
    updateAvailable: state.updateAvailable,
    applyUpdate: state.applyUpdate,
  }),
}));

vi.mock('@/frontend/shared/shell-update', () => ({
  isShellUpdatePending: () => state.shellPending,
}));

describe('UpdatePrompt', () => {
  beforeEach(() => {
    state.updateAvailable = false;
    state.shellPending = false;
    state.applyUpdate = vi.fn();
  });

  it('renders nothing while the document is on the current build', () => {
    const { container } = render(<UpdatePrompt />);
    expect(container).toBeEmptyDOMElement();
  });

  it('announces the waiting build and applies it on the gesture', () => {
    state.updateAvailable = true;
    render(<UpdatePrompt />);

    expect(screen.getByTestId('update-prompt')).toHaveTextContent('يتوفَّر إصدار جديد');

    fireEvent.click(screen.getByRole('button', { name: 'تحديث الآن' }));

    expect(state.applyUpdate).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'جارٍ التحديث…' })).toBeDisabled();
  });

  it('stays down once declined, without touching the update', () => {
    state.updateAvailable = true;
    const { container } = render(<UpdatePrompt />);

    fireEvent.click(screen.getByRole('button', { name: 'لاحقًا' }));

    expect(container).toBeEmptyDOMElement();
    expect(state.applyUpdate).not.toHaveBeenCalled();
  });

  it('leaves the one prompt to the shell while its own update is pending', () => {
    // The APK install brings the web build with it, so asking for a reload as
    // well would be two prompts for one update (ADR-0042).
    state.updateAvailable = true;
    state.shellPending = true;

    const { container } = render(<UpdatePrompt />);

    expect(container).toBeEmptyDOMElement();
  });
});
