import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { KEYBOARD_REWRITE_COPY } from '../keyboard-rewrite-copy';
import { KeyboardRewriteConsent } from '../keyboard-rewrite-consent';

function installBridge({ enabled = false } = {}) {
  const bridge = {
    available: vi.fn(() => true),
    rewriteCredentialEnabled: vi.fn(() => enabled),
    storeRewriteCredential: vi.fn(() => true),
    revokeRewriteCredential: vi.fn(() => true),
  };
  vi.stubGlobal('RoyShellKeyboard', bridge);
  return bridge;
}

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('KeyboardRewriteConsent', () => {
  it('draws nothing without the shell bridge', () => {
    render(<KeyboardRewriteConsent />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('is off by default and says plainly what a tap sends', () => {
    const bridge = installBridge();
    render(<KeyboardRewriteConsent />);

    expect(bridge.rewriteCredentialEnabled).toHaveBeenCalled();
    expect(bridge.storeRewriteCredential).not.toHaveBeenCalled();
    expect(screen.getByText(KEYBOARD_REWRITE_COPY.enableHint)).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: KEYBOARD_REWRITE_COPY.enableLabel })
    ).toBeInTheDocument();
  });

  it('mints a credential from the signed-in page and stores it through the bridge', async () => {
    const bridge = installBridge();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, token: 'payload.signature', scope: 'keyboard.rewrite' }),
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<KeyboardRewriteConsent />);
    fireEvent.click(screen.getByRole('button', { name: KEYBOARD_REWRITE_COPY.enableLabel }));

    await waitFor(() =>
      expect(bridge.storeRewriteCredential).toHaveBeenCalledWith('payload.signature')
    );
    expect(fetchMock).toHaveBeenCalledWith('/api/keyboard/credential', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ consent: true }),
    });
  });

  it('stays off when the mint fails and revokes the stored copy on withdrawal', async () => {
    const bridge = installBridge({ enabled: true });
    render(<KeyboardRewriteConsent />);

    fireEvent.click(screen.getByRole('button', { name: KEYBOARD_REWRITE_COPY.revokeLabel }));
    await waitFor(() => expect(bridge.revokeRewriteCredential).toHaveBeenCalledTimes(1));
    expect(bridge.storeRewriteCredential).not.toHaveBeenCalled();
  });
});
