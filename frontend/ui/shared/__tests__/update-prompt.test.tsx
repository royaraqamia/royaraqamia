import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, render, screen, fireEvent } from '@testing-library/react';
import { UpdatePrompt } from '../update-prompt';

const pwa = vi.hoisted(() => ({ updateAvailable: false, applyUpdate: vi.fn() }));

const shell = vi.hoisted(() => ({
  state: {
    updatePending: false,
    unsupported: false,
    installedCode: null as number | null,
    latestCode: null as number | null,
  },
  listeners: new Set<() => void>(),
}));

vi.mock('@/frontend/ui/PWAProvider', () => ({
  usePWAContext: () => ({ updateAvailable: pwa.updateAvailable, applyUpdate: pwa.applyUpdate }),
}));

vi.mock('@/frontend/shared/shell-update', () => ({
  SHELL_UPDATE_IDLE: {
    updatePending: false,
    unsupported: false,
    installedCode: null,
    latestCode: null,
  },
  // The same object every time: `useSyncExternalStore` treats a fresh snapshot
  // per call as an infinite loop.
  getShellUpdateState: () => shell.state,
  subscribeShellUpdate: (listener: () => void) => {
    shell.listeners.add(listener);
    return () => shell.listeners.delete(listener);
  },
}));

function setShellBehind(behind: boolean) {
  shell.state = { ...shell.state, updatePending: behind };
  act(() => {
    for (const listener of shell.listeners) listener();
  });
}

describe('UpdatePrompt', () => {
  beforeEach(() => {
    pwa.updateAvailable = false;
    pwa.applyUpdate = vi.fn();
    shell.state = {
      updatePending: false,
      unsupported: false,
      installedCode: null,
      latestCode: null,
    };
    shell.listeners.clear();
  });

  it('renders nothing while the document is current', () => {
    const { container } = render(<UpdatePrompt />);
    expect(container).toBeEmptyDOMElement();
  });

  it('announces the waiting build and applies it on the gesture', () => {
    pwa.updateAvailable = true;
    render(<UpdatePrompt />);

    expect(screen.getByTestId('update-prompt')).toHaveTextContent('يتوفَّر إصدار جديد');

    fireEvent.click(screen.getByRole('button', { name: 'تحديث الآن' }));

    expect(pwa.applyUpdate).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'جارٍ التحديث…' })).toBeDisabled();
  });

  it('stays down once declined, without touching the update', () => {
    pwa.updateAvailable = true;
    const { container } = render(<UpdatePrompt />);

    fireEvent.click(screen.getByRole('button', { name: 'لاحقًا' }));

    expect(container).toBeEmptyDOMElement();
    expect(pwa.applyUpdate).not.toHaveBeenCalled();
  });

  it('holds back while the shell is announcing its own update', () => {
    // Installing the new APK brings the newest web build with it, so a reload
    // offer underneath the shell's own prompt would be a second one for the same
    // update (ADR-0043). The shell's prompt is native; this is the whole of the
    // page's half.
    pwa.updateAvailable = true;
    render(<UpdatePrompt />);
    setShellBehind(true);

    expect(screen.queryByTestId('update-prompt')).toBeNull();
  });

  it('comes back if the shell turns out to be current after all', () => {
    pwa.updateAvailable = true;
    render(<UpdatePrompt />);
    setShellBehind(true);
    expect(screen.queryByTestId('update-prompt')).toBeNull();

    setShellBehind(false);

    expect(screen.getByTestId('update-prompt')).toBeInTheDocument();
  });
});
